import { AnthropicLanguageModel, AnthropicClient } from "@effect/ai-anthropic";
import { FetchHttpClient } from "@effect/platform";
import { Config, Layer } from "effect";

import type { ModelRole } from "~/lib/model-roles";
import { ExtractionLanguageModel, MODEL_ROLES, ProseLanguageModel } from "~/lib/model-roles";

/**
 * The AI Gateway exposes an Anthropic-compatible `/v1/messages`, so routing through it is a change
 * of `apiUrl` and nothing else — no provider swap, no second client.
 * See docs/adr/0002-ai-gateway-routing.md.
 *
 * `FetchHttpClient` rather than `@effect/platform-node`: this runs on serverless.
 */

/** No trailing `/v1`. Swap to https://api.anthropic.com to bypass the gateway. */
const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh";

/**
 * Called from inside a handler, never at module scope — module scope is evaluated during
 * bundling, which would bake the key into the build. See .claude/rules/common/security.md.
 */
export function anthropicLayer() {
  const client = AnthropicClient.layerConfig({
    apiKey: Config.redacted("AI_GATEWAY_API_KEY"),
    apiUrl: Config.succeed(process.env.AI_GATEWAY_BASE_URL ?? DEFAULT_BASE_URL),
  });

  return Layer.provide(client, FetchHttpClient.layer);
}

/**
 * Gateway-level model fallback rides on a top-level `providerOptions.gateway` body field that is
 * absent from the Anthropic SDK schema — Vercel's own docs reach for `@ts-expect-error` here.
 * This is the **only** place that cast is allowed to live; keeping it in one function is what
 * stops an untyped escape hatch from spreading through the pipeline.
 *
 * `AnthropicLanguageModel` spreads its `config` straight into the request body, so the returned
 * object arrives at the gateway as a top-level field rather than nested under a model parameter.
 *
 * The response records each attempt in `providerMetadata.modelAttempts[]`. Retries are not a
 * gateway feature — those are written with `Effect.retry` in the pipeline.
 */
export function gatewayFallbackOptions(models: readonly string[]) {
  return { providerOptions: { gateway: { models } } } as unknown as Record<string, never>;
}

/**
 * The request-body fragment one role adds to every call it makes. Named rather than inlined because
 * it is the only part of the fallback wiring that can be asserted without a gateway: the live
 * `providerMetadata.modelAttempts[]` check belongs to the #11 runbook.
 */
export function modelRoleConfig(role: ModelRole) {
  return gatewayFallbackOptions(MODEL_ROLES[role].fallbacks);
}

/**
 * One role's model, with its fallback chain attached. `AnthropicLanguageModel.make` rather than
 * `.model()` because a role is resolved into its own tag: two `Model` Layers would both provide the
 * plain `LanguageModel` tag and the second would simply win.
 */
function roleModel(role: ModelRole) {
  return AnthropicLanguageModel.make({
    config: modelRoleConfig(role),
    model: MODEL_ROLES[role].model,
  });
}

export function extractionModelLayer() {
  return Layer.effect(ExtractionLanguageModel, roleModel("extraction"));
}

export function proseModelLayer() {
  return Layer.effect(ProseLanguageModel, roleModel("prose"));
}
