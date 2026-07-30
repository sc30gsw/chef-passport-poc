import { LanguageModel } from "@effect/ai";
import { Context, Data, Duration, Effect, Layer, Option, Queue, Schedule, Stream } from "effect";

import type { PassportResult, PipelineStep, SkillSet, StepTiming } from "~/data/schemas";
import type { FreeInputInputs, PassportInputs } from "~/features/passport/api/build-passport";
import {
  assessDeterministically,
  deterministicProse,
  personaFromFreeInput,
} from "~/features/passport/api/build-passport";
import { explainCountry } from "~/features/passport/api/steps/explain-country";
import { explainJobMatch } from "~/features/passport/api/steps/explain-job-match";
import { extractSkills } from "~/features/passport/api/steps/extract-skills";
import { translateSkills } from "~/features/passport/api/steps/translate-skills";
import type { PipelineDegradation, PipelineEvent } from "~/features/passport/types/pipeline-event";
import { STEP_LABELS_JA } from "~/features/passport/types/pipeline-event";

/**
 * One interface, two interchangeable implementations. This swap is the core design claim: preset
 * personas and free input run the **same** `Stream<PipelineEvent>`, and only the Layer differs. The
 * timeline component must never branch on which source is active.
 *
 * The Stream has no error channel — failures arrive as a `Failed` event — so the whole thing stays
 * serializable across a server-function boundary.
 */
export class PassportPipeline extends Context.Tag("PassportPipeline")<
  PassportPipeline,
  {
    /** Preset personas: every judgement input is known before the first event. */
    readonly run: (inputs: PassportInputs) => Stream.Stream<PipelineEvent>;
    /**
     * Free input: there is no `Persona` yet. Step 1 reads the résumé and *builds* one, which is why
     * this cannot be `run` with a persona assembled by the caller — the skills the judgement needs
     * do not exist until the extraction has answered. Same event type, same terminal contract.
     */
    readonly runFreeInput: (inputs: FreeInputInputs) => Stream.Stream<PipelineEvent>;
  }
>() {}

export class PipelineError extends Data.TaggedError("PipelineError")<{
  cause?: unknown;
  messageJa: string;
  step: string;
}> {}

/** Replay bounds, so a slow recorded call cannot stall the demo and a fast one is still visible. */
const MIN_REPLAY_MS = 800;
const MAX_REPLAY_MS = 2500;

export function clampReplayMs(durationMs: number): number {
  return Math.min(MAX_REPLAY_MS, Math.max(MIN_REPLAY_MS, durationMs));
}

/** The gateway documents model fallback but not retries — those are ours to write. */
const RESILIENCE = Schedule.exponential("500 millis").pipe(Schedule.intersect(Schedule.recurs(2)));

/**
 * Closed decision #6's two budgets. The per-step one bounds a single hung model call; the total one
 * bounds the run, because four steps that each retry twice inside 30 seconds could otherwise keep a
 * serverless invocation alive well past the platform's own limit and return nothing at all.
 */
const TOTAL_BUDGET = "120 seconds";

/**
 * The fan-out width for the steps that explain several countries and several jobs at once. Bounded
 * rather than unlimited: an unbounded `Effect.all` would open one gateway request per job, which is
 * the fastest way to trip a rate limit on the one call path the demo cannot afford to lose.
 */
const FAN_OUT = { concurrency: 4 } as const;

/**
 * Short nouns for failure text. `STEP_LABELS_JA` are progress sentences ("…しています") and do not
 * compose into a failure message, so the two label sets stay separate.
 */
const STEP_FAILURE_JA = {
  extract: "スキル抽出",
  match: "マッチ理由",
  translate: "スキル翻訳",
  visa: "ビザ判定",
} as const satisfies Record<PipelineStep, string>;

/**
 * Every model call carries the same timeout and retry, and a step that still will not recover
 * becomes a typed `PipelineError` — which `liveProducer` turns into the in-band `Failed` event.
 */
function resilient<A, E, R>(step: PipelineStep, effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.timeout("30 seconds"),
    Effect.retry(RESILIENCE),
    Effect.mapError(
      (cause) =>
        new PipelineError({
          cause,
          messageJa: `${STEP_FAILURE_JA[step]}の生成に失敗しました`,
          step,
        }),
    ),
  );
}

/**
 * The one place a failure becomes an event. `TimeoutException` is matched by tag rather than by
 * `instanceof` — `Effect.timeout` yields a plain tagged value, not a class instance.
 */
function failureEvent(error: unknown): PipelineEvent {
  if (error instanceof PipelineError) {
    return { _tag: "Failed", messageJa: error.messageJa, step: error.step };
  }

  const isTimeout =
    typeof error === "object" && error !== null && "_tag" in error
      ? error._tag === "TimeoutException"
      : false;

  return {
    _tag: "Failed",
    messageJa: isTimeout
      ? "パイプラインが制限時間を超えました"
      : "パイプラインの実行に失敗しました",
    step: "unknown",
  };
}

type Offer = (event: PipelineEvent) => Effect.Effect<void>;

/** `Completed` and `Failed` are terminal: exactly one of them ends every run. */
function isTerminal(event: PipelineEvent): boolean {
  return event._tag === "Completed" || event._tag === "Failed";
}

/**
 * Runs the producer on a forked fibre and hands the consumer a queue-backed Stream, so step events
 * reach the UI *while* the work is still running rather than all at once when it finishes.
 *
 * Termination is driven by the terminal event, not by shutting the queue: `Queue.shutdown` discards
 * anything not yet drained, which silently ate the final `Completed`. The queue is instead released
 * with the scope, once the consumer has finished with it.
 *
 * The `catchAllCause` is a safety net rather than error handling. A *defect* would otherwise kill the
 * producer fibre without emitting a terminal event, and the consumer would wait forever.
 */
function streamFrom<R>(
  producer: (offer: Offer) => Effect.Effect<void, never, R>,
): Stream.Stream<PipelineEvent, never, R> {
  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const queue = yield* Effect.acquireRelease(Queue.unbounded<PipelineEvent>(), Queue.shutdown);
      const offer: Offer = (event) => Queue.offer(queue, event).pipe(Effect.asVoid);

      yield* Effect.forkScoped(
        producer(offer).pipe(
          Effect.catchAllCause(() =>
            offer({
              _tag: "Failed",
              messageJa: "パイプラインの実行に失敗しました",
              step: "unknown",
            }),
          ),
        ),
      );

      return Stream.fromQueue(queue).pipe(Stream.takeUntil(isTerminal));
    }),
  );
}

/** Announces a step, measures it, reports the real duration, and hands back both. */
function timedStep<A, E, R>(step: PipelineStep, offer: Offer, effect: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    yield* offer({ _tag: "StepStarted", labelJa: STEP_LABELS_JA[step], step });
    const [duration, value] = yield* Effect.timed(effect);
    const durationMs = Duration.toMillis(duration);
    yield* offer({ _tag: "StepCompleted", durationMs, step });
    return { durationMs, value };
  });
}

/**
 * Announces, measures and records one step. The array is appended to rather than rebuilt because
 * the timings have to survive across the steps that produce them and land in the final result;
 * it never leaves this module, and the result copies it.
 */
function makeRecorder(offer: Offer, timings: StepTiming[]) {
  return <A, E, R>(step: PipelineStep, effect: Effect.Effect<A, E, R>) =>
    timedStep(step, offer, effect).pipe(
      Effect.map(({ durationMs, value }) => {
        timings.push({ durationMs, step });
        return value;
      }),
    );
}

type StepRecorder = ReturnType<typeof makeRecorder>;

/**
 * Steps 2–4, shared by both entry points. Past step 1 a preset run and a free-input run are the
 * same problem — a `Persona` exists — so there is one implementation of the judgement and one of
 * the wording, and the only thing that differs upstream is where the persona came from.
 */
function assessAndExplain(
  inputs: PassportInputs,
  skillSet: SkillSet,
  timings: StepTiming[],
  record: StepRecorder,
) {
  return Effect.gen(function* () {
    const { jobs, persona, visas, vocabulary } = inputs;

    // Step 2 is deterministic. It still gets a timed step because the screen shows it happening.
    const assessed = yield* record(
      "visa",
      Effect.sync(() => assessDeterministically(inputs)),
    );

    const translatedSkills = yield* record(
      "translate",
      resilient("translate", translateSkills(skillSet.skills, vocabulary)),
    );

    const [countries, jobMatches] = yield* record(
      "match",
      Effect.all(
        [
          Effect.all(
            assessed.countries.map((assessment) =>
              resilient(
                "match",
                explainCountry(
                  persona,
                  assessment,
                  visas.filter((visa) => visa.country === assessment.country),
                ),
              ).pipe(Effect.map((explanationJa) => ({ ...assessment, explanationJa }))),
            ),
            FAN_OUT,
          ),
          Effect.all(
            assessed.matches.map((match) => {
              const job = jobs.find((item) => item.id === match.jobId);
              return job === undefined
                ? Effect.fail(
                    new PipelineError({
                      messageJa: `求人 ${match.jobId} が見つかりません`,
                      step: "match",
                    }),
                  )
                : resilient("match", explainJobMatch(persona, job, match)).pipe(
                    Effect.map((reasonJa) => ({ ...match, reasonJa })),
                  );
            }),
            FAN_OUT,
          ),
        ],
        FAN_OUT,
      ),
    );

    const result: PassportResult = {
      countries,
      excludedJobs: assessed.excluded,
      jobMatches,
      personaId: persona.id,
      proseSource: "llm",
      skillSet,
      timings: [...timings],
      translatedSkills,
    };

    return result;
  });
}

function liveProducer(inputs: PassportInputs, offer: Offer) {
  return Effect.gen(function* () {
    const timings: StepTiming[] = [];
    const record = makeRecorder(offer, timings);

    const skillSet = yield* record(
      "extract",
      resilient("extract", extractSkills(inputs.persona.resumeJa, inputs.vocabulary)),
    );

    yield* offer({
      _tag: "Completed",
      result: yield* assessAndExplain(inputs, skillSet, timings, record),
    });
  }).pipe(
    Effect.timeout(TOTAL_BUDGET),
    Effect.catchAll((error) => offer(failureEvent(error))),
  );
}

/**
 * Free input's degradation. A preset that loses its wording falls back to the committed cache;
 * a stranger's résumé has no cache, so the only thing left is the deterministic wording — which
 * `PassportResult.proseSource` already records, and this says out loud.
 */
const PROSE_FALLBACK: PipelineDegradation = {
  messageJa: "説明文の生成に失敗したため、決定論ロジックが組み立てた説明文に切り替えました。",
  reason: "prose-failed",
};

/**
 * Free input, where step 1 is load-bearing in a way it is not for presets: the extraction is what
 * *builds* the persona the deterministic judgement then runs on. If it fails there is nothing to
 * judge and the run ends in `Failed`; if only the wording fails, the judgement survives and the run
 * completes with deterministic prose.
 */
function freeInputProducer(inputs: FreeInputInputs, offer: Offer) {
  return Effect.gen(function* () {
    const { jobs, profile, visas, vocabulary } = inputs;
    const timings: StepTiming[] = [];
    const record = makeRecorder(offer, timings);

    const extracted = yield* record(
      "extract",
      resilient("extract", extractSkills(profile.resume, vocabulary)),
    );

    // The declared language level overrides the model's reading of it: it is a judgement input, so
    // the screen must never show a level the score did not use. See types/free-input-request.ts.
    const skillSet: SkillSet = { ...extracted, languageLevel: profile.languageLevel };
    const withPersona: PassportInputs = {
      jobs,
      persona: personaFromFreeInput(profile, skillSet),
      visas,
      vocabulary,
    };

    const explained = yield* Effect.option(
      assessAndExplain(withPersona, skillSet, timings, record),
    );

    yield* offer(
      Option.isSome(explained)
        ? { _tag: "Completed", result: explained.value }
        : {
            _tag: "Completed",
            degraded: PROSE_FALLBACK,
            result: { ...deterministicProse(withPersona), skillSet, timings: [...timings] },
          },
    );
  }).pipe(
    Effect.timeout(TOTAL_BUDGET),
    Effect.catchAll((error) => offer(failureEvent(error))),
  );
}

/**
 * Gateway-backed. `Layer.effect` resolves the model once and provides it into the Stream, which is
 * what keeps `PassportPipeline`'s interface free of a context requirement — the two Layers stay
 * substitutable precisely because the live one absorbs its own dependency here.
 */
export const PipelineLive = Layer.effect(
  PassportPipeline,
  Effect.map(LanguageModel.LanguageModel, (model) => ({
    run: (inputs: PassportInputs) =>
      streamFrom((offer) => liveProducer(inputs, offer)).pipe(
        Stream.provideService(LanguageModel.LanguageModel, model),
      ),
    runFreeInput: (inputs: FreeInputInputs) =>
      streamFrom((offer) => freeInputProducer(inputs, offer)).pipe(
        Stream.provideService(LanguageModel.LanguageModel, model),
      ),
  })),
);

/**
 * Committed-cache replay. Uses the durations the generator actually measured, clamped — real
 * recorded timing rather than a fake progress bar, which is what makes it honest to describe.
 *
 * `paced` decides only *when* the events are emitted, never what they contain: a consumer that
 * wants the finished result rather than the timeline (the SSR loader) would otherwise wait out the
 * whole replay before rendering anything. The choice is made in `~/lib/runtime`, not here.
 */
export function pipelineFromCache(
  lookup: (personaId: string) => PassportResult | undefined,
  options: Partial<Record<"paced", boolean>> = {},
): Layer.Layer<PassportPipeline> {
  const paced = options.paced ?? true;

  return Layer.succeed(PassportPipeline, {
    run: (inputs) =>
      streamFrom((offer) =>
        Effect.gen(function* () {
          const cached = lookup(inputs.persona.id);

          if (cached === undefined) {
            yield* offer({
              _tag: "Failed",
              messageJa: `${inputs.persona.id} の事前生成結果が見つかりません`,
              step: "cache",
            });
            return;
          }

          for (const timing of cached.timings) {
            yield* offer({
              _tag: "StepStarted",
              labelJa: STEP_LABELS_JA[timing.step],
              step: timing.step,
            });
            if (paced) yield* Effect.sleep(Duration.millis(clampReplayMs(timing.durationMs)));
            yield* offer({
              _tag: "StepCompleted",
              durationMs: timing.durationMs,
              step: timing.step,
            });
          }

          yield* offer({ _tag: "Completed", result: cached });
        }),
      ),
    /**
     * Implemented so the tag has one honest shape, not to be useful: there is no committed cache
     * for a résumé nobody has seen. Saying so as a `Failed` event is what stops a caller from
     * silently getting somebody else's passport back.
     */
    runFreeInput: () =>
      streamFrom((offer) =>
        offer({
          _tag: "Failed",
          messageJa: "自由入力は事前生成キャッシュから再生できません。ライブ生成が必要です。",
          step: "cache",
        }),
      ),
  });
}

/**
 * Collapses a run to its outcome, for callers that need the finished `PassportResult` rather than
 * the live timeline — today the SSR loader in `passport-server.ts`. The streaming path consumes
 * `run` directly; both resolve the same tag, so the Layer chosen in `~/lib/runtime` is what decides
 * whether the result came from the cache or the gateway.
 *
 * The in-band `Failed` event becomes a typed `PipelineError` here, because a caller that is not a
 * timeline has nowhere to put an event.
 */
export function runPassportPipeline(inputs: PassportInputs) {
  return Effect.gen(function* () {
    const pipeline = yield* PassportPipeline;
    const terminal = Option.getOrUndefined(yield* Stream.runLast(pipeline.run(inputs)));

    if (terminal?._tag === "Completed") return terminal.result;

    return yield* Effect.fail(
      new PipelineError({
        messageJa:
          terminal?._tag === "Failed" ? terminal.messageJa : "パイプラインが結果を返しませんでした",
        step: terminal?._tag === "Failed" ? terminal.step : "unknown",
      }),
    );
  });
}
