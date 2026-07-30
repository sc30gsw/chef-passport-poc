import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { FetchHttpClient } from "@effect/platform";
import { Config, Layer } from "effect";

/**
 * The AI Gateway exposes an Anthropic-compatible `/v1/messages`, so routing through it is a change
 * of `apiUrl` and nothing else — no provider swap, no second client.
 * See docs/adr/0002-ai-gateway-routing.md.
 *
 * `FetchHttpClient` rather than `@effect/platform-node`: this runs on serverless.
 */

/** No trailing `/v1`. Swap to https://api.anthropic.com to bypass the gateway. */
const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh";

/** Extraction and translation — cheap and structural. */
export const EXTRACTION_MODEL = "anthropic/claude-haiku-4.5";

/** Explanation prose. Model slugs must be provider-prefixed; a bare slug returns 404. */
export const PROSE_MODEL = "anthropic/claude-sonnet-5";

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

export function extractionModel() {
  return AnthropicLanguageModel.model(EXTRACTION_MODEL);
}

export function proseModel() {
  return AnthropicLanguageModel.model(PROSE_MODEL);
}

/**
 * Gateway-level model fallback rides on a top-level `providerOptions.gateway` body field that is
 * absent from the Anthropic SDK schema — Vercel's own docs reach for `@ts-expect-error` here.
 * This is the **only** place that cast is allowed to live; keeping it in one function is what
 * stops an untyped escape hatch from spreading through the pipeline.
 *
 * The response records each attempt in `providerMetadata.modelAttempts[]`. Retries are not a
 * gateway feature — those are written with `Effect.retry` in the pipeline.
 */
export function gatewayFallbackOptions(models: readonly string[]) {
  return { providerOptions: { gateway: { models } } } as unknown as Record<string, never>;
}
