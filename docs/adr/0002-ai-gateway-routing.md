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

## Amendment, 2026-07-30 — model split, fallback and retry budget

### Two models, two tags

`.claude/rules/web/ai-pipeline.md` calls for haiku-4.5 on extraction and translation and sonnet-5 on
the two explanation-prose steps. `PipelineLive` therefore resolves **two** tags —
`ExtractionLanguageModel` and `ProseLanguageModel`, declared in `src/lib/model-roles.ts` — instead of
the one plain `LanguageModel`, and provides the right one into each step call site.

The alternative was for the prose steps to reach for a prose tag themselves. Rejected: a step would
then hardcode its own model, the pipeline could no longer be driven end-to-end on a single model
(which is what every stub test and the offline generator do), and the choice would be spread across
four files instead of stated once. `PassportPipeline`'s interface is unchanged either way — the live
Layer absorbs both dependencies exactly as it absorbed one, so the cache Layer stays substitutable.

### Fallback chain

Each role's gateway fallback is the _other_ role's model, so the account needs exactly two slugs and
a single-model outage costs money (extraction promoted to sonnet) or polish (prose demoted to haiku)
rather than costing the run. The `providerOptions.gateway` cast stays inside
`gatewayFallbackOptions`; `modelRoleConfig` is the seam a unit test asserts against.

`providerMetadata.modelAttempts[]` — the gateway's own half of this contract — **has not been
verified against a live gateway**. This environment's proxy denies `ai-gateway.vercel.sh`, so every
test uses stub Layers. Live verification belongs to the gateway-verification runbook.

### Retry and timeout budget

All four LLM steps go through `resilient()`: `Effect.timeout("30 seconds")` **inside**
`Effect.retry(exponential 500ms ∩ recurs(2))`, so the budget bounds each attempt rather than the
step, and a hung call is abandoned and retried. The run as a whole is capped at 120 seconds and the
fan-out steps run at `{ concurrency: 4 }`. Tests pin the retry ceiling at 2 (two transient failures
absorbed, three not). The two timeout values are not covered by a test — driving them would need a
`TestClock` inside a forked producer fibre, which is more fragile than the constants it would guard.

### Cost

Measured 2026-07-30 with `@anthropic-ai/tokenizer` over the real prompt builders and the three
committed personas. **Input tokens are exact; output tokens are estimated** (the committed cache
holds deterministic prose, so there is no recorded model output to count) — 2–3 Japanese sentences
per country explanation, 1–2 per job reason.

| Step            | Role      | Calls/persona | In tok | Out tok |
| --------------- | --------- | ------------- | ------ | ------- |
| extract         | haiku-4.5 | 1             | ~1,090 | ~90     |
| translate       | haiku-4.5 | 1             | ~520   | ~480    |
| explain-country | sonnet-5  | 3             | ~1,100 | ~435    |
| explain-job     | sonnet-5  | ~12.7         | ~4,760 | ~1,215  |
| **total**       |           | ~17.7         | ~7,470 | ~2,220  |

At $1/$5 per 1M (haiku-4.5, Anthropic list price) and $2/$10 per 1M (sonnet-5, per
`.claude/rules/web/ai-pipeline.md`): **≈ $0.033 per live run**, ≈ $0.098 for all three personas.
Roughly 86% of that is the prose half, and the job-reason step alone is ~66% — it is the one that
fans out. On haiku alone the same run would be ≈ $0.019, so the split costs about +76%.

This is a floor: it excludes the retry attempts a real run may spend and any gateway surcharge. A
per-key spend ceiling is set in the gateway dashboard (owner-confirmed, 2026-07-30), which is what
actually bounds the exposure of a public demo URL.

### The committed cache is deliberately not regenerated

Introducing sonnet-5 for prose changes generated output, so `src/data/cache/` now holds prose that a
live run would not produce. It stays as-is: regeneration requires gateway access this environment
does not have, and hand-editing a generated artifact is forbidden. Every _judgement_ in the cache is
unaffected — it comes from `src/domain/`, which the split does not touch — and `proseSource` already
records that the committed prose is `"deterministic"`. `scripts/generate-passport.ts` composes both
model Layers, so the next `vp run generate:passport` with a working key produces split-model prose
with no further code change.
