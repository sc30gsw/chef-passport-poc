import { Layer } from "effect";

import { lookupCachedPassport } from "~/data/cache-index";
import { PipelineLive, pipelineFromCache } from "~/features/passport/api/pipeline-service";
import { anthropicLayer, extractionModel } from "~/lib/ai-client";

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
 */
export function passportPipelineLive() {
  return PipelineLive.pipe(Layer.provide(extractionModel()), Layer.provide(anthropicLayer()));
}

/**
 * Free-input mode calls a paid API from a public URL, so it is gated server-side and defaults off.
 * Preset personas work with the flag off. See .claude/rules/common/security.md.
 *
 * Kept deliberately: the owner has since abolished this flag in favour of gating on the presence of
 * `AI_GATEWAY_API_KEY`, and issue #8 owns removing it together with the `/free` copy that names it.
 * Deleting it here would break that route mid-branch for no gain.
 */
export function isFreeInputEnabled(): boolean {
  return process.env.ENABLE_FREE_INPUT === "true";
}
