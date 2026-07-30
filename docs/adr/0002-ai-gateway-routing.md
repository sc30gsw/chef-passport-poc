# 0002 — Route model calls through Vercel AI Gateway

- **Status:** accepted
- **Date:** 2026-07-30

## Context

The PoC needs Anthropic models from a Vercel deployment. Two routes exist: call
`https://api.anthropic.com` directly, or go through Vercel AI Gateway. The gateway adds spend
controls and model fallback; a public demo URL with a paid key behind it needs both.

`@effect/ai-anthropic` speaks the Anthropic `/v1/messages` protocol, and the gateway exposes an
Anthropic-compatible `/v1/messages`. So the gateway is reachable by changing one config value.

## Decision

Route through the gateway by pointing `AnthropicClient.layerConfig`'s `apiUrl` at
`https://ai-gateway.vercel.sh` (no trailing `/v1`), read from `AI_GATEWAY_BASE_URL`. No provider
swap, no second client.

## Consequences

- Model slugs must be provider-prefixed: `anthropic/claude-haiku-4.5`,
  `anthropic/claude-sonnet-5`. A bare `claude-sonnet-5` returns 404.
- No Claude model is free-tier eligible, so paid gateway credits are required. A per-key spend
  ceiling is set in the gateway dashboard — one of the three abuse guards on free-input mode.
- Keeping `apiUrl` behind an env var means a direct `https://api.anthropic.com` run stays
  possible if the gateway misbehaves during the demo.
- Gateway-level model fallback rides on a top-level `providerOptions.gateway` body field that is
  absent from the Anthropic SDK schema. Injecting it needs a cast, which is isolated to a single
  module rather than spread through the pipeline.
- Retries are **not** a documented gateway feature. They are written with `Effect.retry`.
