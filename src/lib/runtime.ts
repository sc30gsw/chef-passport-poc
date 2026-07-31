import { Layer } from "effect";

import { lookupCachedPassport } from "~/data/cache-index";
import { PipelineLive, pipelineFromCache } from "~/features/passport/api/pipeline-service";
import { anthropicLayer, extractionModelLayer, proseModelLayer } from "~/lib/ai-client";

/**
 * The single Layer composition point. Layers cannot live inside a feature — this module sits above
 * `features/` precisely so the choice of implementation is made in exactly one place, and every
 * consumer resolves the `PassportPipeline` tag rather than reaching for a cache lookup of its own.
 *
 * Both Layers satisfy that one tag, so nothing downstream knows which is active. That substitution
 * is the project's core design claim.
 *
 * `scripts/generate-passport.ts` is the one deliberate exception: it runs under plain Node, where
 * the `~/` alias does not resolve and the statically imported cache JSON cannot be loaded, so it
 * composes `PipelineLive` locally. It still consumes the pipeline through the same tag.
 */

/**
 * Preset personas: replays the committed cache. No key, no network, reproducible.
 *
 * `paced` decides only when the events arrive. The streaming path wants the recorded pacing; the
 * SSR loader wants the finished result at once, because the timings travel with it and
 * `usePipelineReplay` paces them in the browser — pacing on both sides would stall the navigation
 * for the whole replay and then replay it a second time.
 */
export function passportPipelineFromCache(options: Partial<Record<"paced", boolean>> = {}) {
  return pipelineFromCache(lookupCachedPassport, options);
}

/**
 * Free input and live preset generation through the gateway. Built lazily inside the handler,
 * because the API key must not be read at module scope — module scope is evaluated during bundling.
 *
 * Whether it is built at all is decided by `~/lib/gateway-key`. There is no feature flag: the owner
 * abolished `ENABLE_FREE_INPUT` on 2026-07-30 in favour of gating on the key alone.
 * See .claude/rules/common/security.md.
 *
 * Two model Layers, one client: haiku-4.5 for the structural steps, sonnet-5 for the prose. Both
 * are built on the same `AnthropicClient`, so the split costs one extra Layer and no extra
 * connection. See `~/lib/model-roles`.
 */
export function passportPipelineLive() {
  return PipelineLive.pipe(
    Layer.provide(Layer.merge(extractionModelLayer(), proseModelLayer())),
    Layer.provide(anthropicLayer()),
  );
}
