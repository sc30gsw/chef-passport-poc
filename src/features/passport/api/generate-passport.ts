import type { Layer } from "effect";
import { Cause, Effect, Exit, Option, Stream } from "effect";

import { loadJobs, loadPersona, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import type { PassportInputs } from "~/features/passport/api/build-passport";
import type { RunBudget } from "~/features/passport/api/live-run-budget";
import { liveRunBudget } from "~/features/passport/api/live-run-budget";
import { PassportPipeline } from "~/features/passport/api/pipeline-service";
import { presetSingleFlight } from "~/features/passport/api/single-flight";
import type { PassportStreamRequest } from "~/features/passport/types/passport-stream-request";
import type {
  EncodedPipelineEvent,
  PipelineDegradation,
} from "~/features/passport/types/pipeline-event";
import { encodePipelineEvent } from "~/features/passport/types/pipeline-event";
import { hasGatewayKey } from "~/lib/gateway-key";

/**
 * The streaming transport's handler body, kept out of the `createServerFn` wrapper so it can be
 * unit-tested directly. See .claude/rules/web/tanstack-start.md.
 *
 * Both Layers arrive as arguments rather than being chosen here. That is what keeps this module
 * clear of `~/lib/runtime` — a module the client build must never reach, because runtime.ts pulls
 * `@effect/ai-anthropic` and its tiktoken wasm in behind it.
 */
export type PassportPipelineLayers = {
  readonly cache: () => Layer.Layer<PassportPipeline>;
  /**
   * Non-`never` error channel: the live Layer reads `AI_GATEWAY_API_KEY` through `Config`, so
   * building it can fail. That failure surfaces when the async iterable is pulled and is caught
   * like any other live failure — one fallback path, not two.
   */
  readonly live: () => Layer.Layer<PassportPipeline, unknown>;
};

/**
 * The reasons a *preset* run can be downgraded — every one of them means the committed cache stood
 * in for a live run. `prose-failed` is excluded deliberately: it belongs to free input, which has
 * no cache to fall back to, and is set inside the Layer rather than here.
 */
type PresetDegradationReason = Exclude<PipelineDegradation["reason"], "prose-failed">;

const DEGRADATION_JA = {
  "in-flight": "このシェフのライブ生成がすでに実行中のため、事前生成キャッシュを再生しました。",
  "live-failed": "ライブ生成に失敗したため、事前生成キャッシュを最初から再生しました。",
  "no-key": "サーバーにAPIキーが設定されていないため、事前生成キャッシュを再生しました。",
  "rate-limited":
    "このサーバーのライブ生成回数が上限に達したため、事前生成キャッシュを再生しました。しばらく待つと再びライブ生成できます。",
} as const satisfies Record<PresetDegradationReason, string>;

function degradation(reason: PresetDegradationReason): PipelineDegradation {
  return { messageJa: DEGRADATION_JA[reason], reason };
}

function loadInputs(personaId: string) {
  return Effect.gen(function* () {
    const persona = yield* loadPersona(personaId);
    const visas = yield* loadVisaRequirements;
    const jobs = yield* loadJobs;
    const vocabulary = yield* loadSkillVocabulary;

    return { jobs, persona, visas, vocabulary } satisfies PassportInputs;
  });
}

/**
 * `Stream.provideLayer` rather than `Effect.provide` on the wrapping effect: the Layer has to stay
 * alive for as long as the Stream is being consumed, and providing it to the effect that merely
 * *produces* the Stream would release it before the first event arrives.
 */
function pipelineEvents<E>(layer: Layer.Layer<PassportPipeline, E>, inputs: PassportInputs) {
  return Stream.toAsyncIterable(
    Stream.unwrap(Effect.map(PassportPipeline, (pipeline) => pipeline.run(inputs))).pipe(
      Stream.provideLayer(layer),
    ),
  );
}

/**
 * The cache replay, with the degradation reason attached to its terminal event. Emitted from the
 * first step every time, including when it stands in for a half-finished live run: closed decision
 * #6 discards the partial output rather than splicing two runs together, because a timeline that
 * resumes mid-way would report step durations that never belonged to one run.
 */
async function* replayFromCache(
  layers: PassportPipelineLayers,
  inputs: PassportInputs,
  degraded: PipelineDegradation | undefined,
): AsyncGenerator<EncodedPipelineEvent> {
  for await (const event of pipelineEvents(layers.cache(), inputs)) {
    yield encodePipelineEvent(
      event._tag === "Completed" && degraded !== undefined ? { ...event, degraded } : event,
    );
  }
}

/**
 * Server-side source selection — the heart of the ticket. `live` is what the client asked for;
 * these are the facts that can overrule it, each of them reported rather than hidden.
 *
 * The key is read **inside** the handler. At module scope it would be evaluated during bundling.
 * There is no feature flag: key presence is the gate (owner decision, 2026-07-30). See
 * .claude/rules/common/security.md.
 */
function resolveSource(request: PassportStreamRequest, budget: RunBudget) {
  if (!request.live) return { degraded: undefined, live: false };

  if (!hasGatewayKey()) {
    return { degraded: degradation("no-key"), live: false };
  }

  // Acquires a slot as a side effect. Released in `streamPassportEvents`' `finally`.
  if (!presetSingleFlight.acquire(request.personaId)) {
    return { degraded: degradation("in-flight"), live: false };
  }

  // Last, and only once the run is otherwise going ahead: a refusal must not spend a token, and a
  // spent token must not leave the slot behind. The slot is what makes the order matter.
  if (!budget.tryConsume()) {
    presetSingleFlight.release(request.personaId);
    return { degraded: degradation("rate-limited"), live: false };
  }

  return { degraded: undefined, live: true };
}

function loadFailureJa(personaId: string, cause: Cause.Cause<{ readonly message: string }>) {
  const failure = Cause.failureOption(cause);

  return Option.isNone(failure)
    ? `ペルソナ ${personaId} を読み込めませんでした`
    : failure.value.message;
}

/**
 * `personaId` in, `PipelineEvent`s out, one at a time. Preset replay and live generation are the
 * same `Stream<PipelineEvent>` behind the same tag, so nothing downstream — this generator
 * included — branches on which one produced an event.
 *
 * Failures never reach the caller as exceptions: a load failure becomes a `Failed` event, and a
 * live failure becomes a full cache replay carrying `degraded`, so the demo always finishes.
 */
export async function* streamPassportEvents(
  request: PassportStreamRequest,
  layers: PassportPipelineLayers,
  budget: RunBudget = liveRunBudget,
): AsyncGenerator<EncodedPipelineEvent> {
  const loaded = await Effect.runPromiseExit(loadInputs(request.personaId));

  if (Exit.isFailure(loaded)) {
    yield encodePipelineEvent({
      _tag: "Failed",
      messageJa: loadFailureJa(request.personaId, loaded.cause),
      step: "load",
    });
    return;
  }

  const inputs = loaded.value;
  const { degraded, live } = resolveSource(request, budget);

  if (!live) {
    yield* replayFromCache(layers, inputs, degraded);
    return;
  }

  try {
    for await (const event of pipelineEvents(layers.live(), inputs)) {
      if (event._tag === "Failed") break;

      yield encodePipelineEvent(event);
      if (event._tag === "Completed") return;
    }
  } catch {
    // A defect rather than a modelled failure. Same answer: the cache replay below.
  } finally {
    presetSingleFlight.release(request.personaId);
  }

  yield* replayFromCache(layers, inputs, degradation("live-failed"));
}
