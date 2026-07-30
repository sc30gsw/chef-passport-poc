import { LanguageModel } from "@effect/ai";
import { Context, Duration, Effect, Layer, Queue, Stream } from "effect";

import type { PassportResult, PipelineStep, StepTiming } from "~/data/schemas";
import type { PassportInputs } from "~/features/passport/api/build-passport";
import { PipelineError, assessDeterministically } from "~/features/passport/api/build-passport";
import { explainCountry } from "~/features/passport/api/steps/explain-country";
import { explainJobMatch } from "~/features/passport/api/steps/explain-job-match";
import { extractSkills } from "~/features/passport/api/steps/extract-skills";
import { translateSkills } from "~/features/passport/api/steps/translate-skills";
import type { PipelineEvent } from "~/features/passport/types/pipeline-event";
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
  { readonly run: (inputs: PassportInputs) => Stream.Stream<PipelineEvent> }
>() {}

/** Replay bounds, so a slow recorded call cannot stall the demo and a fast one is still visible. */
const MIN_REPLAY_MS = 800;
const MAX_REPLAY_MS = 2500;

export function clampReplayMs(durationMs: number): number {
  return Math.min(MAX_REPLAY_MS, Math.max(MIN_REPLAY_MS, durationMs));
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

function liveProducer(inputs: PassportInputs, offer: Offer) {
  return Effect.gen(function* () {
    const { jobs, persona, visas, vocabulary } = inputs;
    const timings: StepTiming[] = [];

    const record = <A, E, R>(step: PipelineStep, effect: Effect.Effect<A, E, R>) =>
      timedStep(step, offer, effect).pipe(
        Effect.map(({ durationMs, value }) => {
          timings.push({ durationMs, step });
          return value;
        }),
      );

    const skillSet = yield* record("extract", extractSkills(persona.resumeJa, vocabulary));

    // Step 2 is deterministic. It still gets a timed step because the screen shows it happening.
    const assessed = yield* record(
      "visa",
      Effect.sync(() => assessDeterministically(inputs)),
    );

    const translatedSkills = yield* record(
      "translate",
      translateSkills(skillSet.skills, vocabulary),
    );

    const [countries, jobMatches] = yield* record(
      "match",
      Effect.all([
        Effect.all(
          assessed.countries.map((assessment) =>
            explainCountry(
              persona,
              assessment,
              visas.filter((visa) => visa.country === assessment.country),
            ).pipe(Effect.map((explanationJa) => ({ ...assessment, explanationJa }))),
          ),
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
              : explainJobMatch(persona, job, match).pipe(
                  Effect.map((reasonJa) => ({ ...match, reasonJa })),
                );
          }),
        ),
      ]),
    );

    const result: PassportResult = {
      countries,
      excludedJobs: assessed.excluded,
      jobMatches,
      personaId: persona.id,
      proseSource: "llm",
      skillSet,
      timings,
      translatedSkills,
    };

    yield* offer({ _tag: "Completed", result });
  }).pipe(
    Effect.catchAll((error) =>
      offer({
        _tag: "Failed",
        messageJa:
          error instanceof PipelineError ? error.messageJa : "パイプラインの実行に失敗しました",
        step: error instanceof PipelineError ? error.step : "unknown",
      }),
    ),
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
  })),
);

/**
 * Committed-cache replay. Uses the durations the generator actually measured, clamped — real
 * recorded timing rather than a fake progress bar, which is what makes it honest to describe.
 */
export function pipelineFromCache(
  lookup: (personaId: string) => PassportResult | undefined,
): Layer.Layer<PassportPipeline> {
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
            yield* Effect.sleep(Duration.millis(clampReplayMs(timing.durationMs)));
            yield* offer({
              _tag: "StepCompleted",
              durationMs: timing.durationMs,
              step: timing.step,
            });
          }

          yield* offer({ _tag: "Completed", result: cached });
        }),
      ),
  });
}
