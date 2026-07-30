import { Layer } from "effect";

import { lookupCachedPassport } from "~/data/cache-index";
import { PipelineLive, pipelineFromCache } from "~/features/passport/api/pipeline-service";
import { anthropicLayer, extractionModel } from "~/lib/ai-client";

/**
 * The single Layer composition point. Layers cannot live inside a feature — this module sits above
 * `features/` precisely so the choice of implementation is made in exactly one place.
 *
 * Both Layers satisfy the same `PassportPipeline` tag, so nothing downstream knows which is active.
 * That substitution is the project's core design claim.
 */

/** Preset personas: replays the committed cache. No key, no network, reproducible. */
export const PassportPipelineFromCache = pipelineFromCache(lookupCachedPassport);

/**
 * Free input: live generation through the gateway. Built lazily inside the handler, because the API
 * key must not be read at module scope — module scope is evaluated during bundling.
 */
export function passportPipelineLive() {
  return PipelineLive.pipe(Layer.provide(extractionModel()), Layer.provide(anthropicLayer()));
}

/**
 * Free-input mode calls a paid API from a public URL, so it is gated server-side and defaults off.
 * Preset personas work with the flag off. See .claude/rules/common/security.md.
 */
export function isFreeInputEnabled(): boolean {
  return process.env.ENABLE_FREE_INPUT === "true";
}
