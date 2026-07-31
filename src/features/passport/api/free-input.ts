import type { ConfigError, Layer } from "effect";
import { Cause, Effect, Exit, Option, Stream } from "effect";

import { loadJobs, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import type { FreeInputInputs } from "~/features/passport/api/build-passport";
import type { RunBudget } from "~/features/passport/api/live-run-budget";
import { liveRunBudget } from "~/features/passport/api/live-run-budget";
import { PassportPipeline } from "~/features/passport/api/pipeline-service";
import { createSingleFlight } from "~/features/passport/api/single-flight";
import type { FreeInputRequest } from "~/features/passport/types/free-input-request";
import type { EncodedPipelineEvent, PipelineEvent } from "~/features/passport/types/pipeline-event";
import { encodePipelineEvent } from "~/features/passport/types/pipeline-event";
import { hasGatewayKey } from "~/lib/gateway-key";

/**
 * Free input's handler body, kept out of the `createServerFn` wrapper so it can be unit-tested
 * directly, and clear of `~/lib/runtime` so nothing drags the gateway client into the client build.
 * Same shape as `generate-passport.ts`; see .claude/rules/web/tanstack-start.md.
 *
 * How this differs from preset generation, and why: a preset that cannot reach the gateway replays
 * its committed cache, so it always finishes. A stranger's résumé has no cache. That makes every
 * guard here a **refusal** rather than a downgrade — which is also what makes it a real guard, since
 * a public URL with a paid key behind it must be able to say no.
 */
export type FreeInputLayers = {
  /**
   * Non-`never` error channel, and named rather than widened to `unknown`: building the live Layer
   * reads `AI_GATEWAY_API_KEY` through `Config`, so the one way it can fail is a `ConfigError`.
   * `unknown` would have accepted a Layer that fails for any other reason too, which is the untyped
   * error channel `.claude/rules/typescript/effect-patterns.md` warns against. There is no cache
   * Layer here — there is nothing for it to replay.
   */
  readonly live: () => Layer.Layer<PassportPipeline, ConfigError.ConfigError>;
};

/**
 * Closed decision #6: one free-input run at a time for the whole process, and a collision is
 * refused rather than queued — queueing would multiply the spend for the same click. The key is a
 * constant because the slot is global; there is no per-caller identity to key it on.
 */
const FREE_INPUT_SLOT = "free-input";
export const freeInputSingleFlight = createSingleFlight(1);

const NO_KEY_JA =
  "サーバーにAPIキーが設定されていないため、自由入力は利用できません。プリセットのシェフはキャッシュ再生で動作します。";

const IN_FLIGHT_JA =
  "別の自由入力がすでに実行中です。完了してから再度お試しください（同時実行は1件までです）。";

const RATE_LIMITED_JA =
  "このサーバーのライブ生成回数が上限に達しました。しばらく待ってから再度お試しください。プリセットのシェフはキャッシュ再生でいつでも動作します。";

const LOAD_FAILED_JA = "求人・ビザ・語彙データを読み込めませんでした";

const TRANSPORT_FAILED_JA = "ライブ生成を開始できませんでした";

/**
 * A refusal is a `Failed` event, not a thrown error and not a `degraded` `Completed`: the stream's
 * error channel stays `never` so the payload remains serializable, and `degraded` rides on a result
 * that a refused run does not have. The UI already renders `Failed` — see `derivePipelineRunState`.
 */
function refusal(messageJa: string): PipelineEvent {
  return { _tag: "Failed", messageJa, step: "guard" };
}

const loadStaticData = Effect.gen(function* () {
  const visas = yield* loadVisaRequirements;
  const jobs = yield* loadJobs;
  const vocabulary = yield* loadSkillVocabulary;

  return { jobs, visas, vocabulary };
});

/**
 * `Stream.provideLayer` rather than `Effect.provide`: the Layer must outlive the production of the
 * Stream, or it would be released before the first event arrives.
 */
function freeInputEvents<E>(layer: Layer.Layer<PassportPipeline, E>, inputs: FreeInputInputs) {
  return Stream.toAsyncIterable(
    Stream.unwrap(Effect.map(PassportPipeline, (pipeline) => pipeline.runFreeInput(inputs))).pipe(
      Stream.provideLayer(layer),
    ),
  );
}

function loadFailureJa(cause: Cause.Cause<{ readonly message: string }>) {
  const failure = Cause.failureOption(cause);

  return Option.isNone(failure) ? LOAD_FAILED_JA : failure.value.message;
}

/**
 * A validated résumé in, `PipelineEvent`s out, one at a time — the same event type the preset
 * timeline consumes, so no component branches on which one it is watching.
 *
 * Guard order is load-bearing. The key check comes first and `layers.live()` is not even built
 * before it passes, so a keyless deployment cannot reach the gateway however the request is shaped.
 * The single-flight slot is taken second, and released in `finally` whatever happens. The run
 * budget is spent last, inside the `try`, so a refusal costs no token and a token never strands the
 * slot — it bounds how many runs this process starts at all, which single-flight does not.
 */
export async function* streamFreeInputEvents(
  request: FreeInputRequest,
  layers: FreeInputLayers,
  budget: RunBudget = liveRunBudget,
): AsyncGenerator<EncodedPipelineEvent> {
  if (!hasGatewayKey()) {
    yield encodePipelineEvent(refusal(NO_KEY_JA));
    return;
  }

  if (!freeInputSingleFlight.acquire(FREE_INPUT_SLOT)) {
    yield encodePipelineEvent(refusal(IN_FLIGHT_JA));
    return;
  }

  try {
    if (!budget.tryConsume()) {
      yield encodePipelineEvent(refusal(RATE_LIMITED_JA));
      return;
    }

    const loaded = await Effect.runPromiseExit(loadStaticData);

    if (Exit.isFailure(loaded)) {
      yield encodePipelineEvent({
        _tag: "Failed",
        messageJa: loadFailureJa(loaded.cause),
        step: "load",
      });
      return;
    }

    for await (const event of freeInputEvents(layers.live(), {
      ...loaded.value,
      profile: request,
    })) {
      yield encodePipelineEvent(event);
    }
  } catch {
    // A defect rather than a modelled failure — most plausibly the live Layer failing to build.
    yield encodePipelineEvent(refusal(TRANSPORT_FAILED_JA));
  } finally {
    freeInputSingleFlight.release(FREE_INPUT_SLOT);
  }
}
