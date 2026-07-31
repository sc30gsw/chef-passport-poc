import type { LanguageModel } from "@effect/ai";
import { Context } from "effect";

/**
 * Which model plays which role, and the tag each role is resolved through.
 *
 * Kept apart from `~/lib/ai-client` on purpose: this module has no runtime import of
 * `@effect/ai-anthropic`, so `pipeline-service.ts` can declare its two dependencies without
 * dragging the Anthropic client — and its tiktoken wasm — into anything that reaches the client
 * build. `ai-client.ts` is where these tags get their Anthropic-backed implementations.
 */

/** Extraction and translation — cheap and structural. */
export const EXTRACTION_MODEL = "anthropic/claude-haiku-4.5";

/** Explanation prose. Model slugs must be provider-prefixed; a bare slug returns 404. */
export const PROSE_MODEL = "anthropic/claude-sonnet-5";

export type ModelRole = "extraction" | "prose";

/**
 * The model split from .claude/rules/web/ai-pipeline.md, as one table: haiku-4.5 turns résumé prose
 * into structure, sonnet-5 writes the two explanation texts a human actually reads.
 *
 * Each role's gateway fallback is the *other* role's model. That keeps the account down to two
 * slugs, and it means a single-model outage costs the demo either money (extraction promoted to
 * sonnet) or polish (prose demoted to haiku) rather than costing it the run.
 */
export const MODEL_ROLES = {
  extraction: { fallbacks: [PROSE_MODEL], model: EXTRACTION_MODEL },
  prose: { fallbacks: [EXTRACTION_MODEL], model: PROSE_MODEL },
} as const satisfies Record<ModelRole, { fallbacks: readonly string[]; model: string }>;

/**
 * Two tags rather than one `LanguageModel.LanguageModel`, because the four steps need two different
 * models and a step must not be the thing that decides which. The steps keep asking for the plain
 * `LanguageModel` tag; `pipeline-service.ts` provides one of these two into each call site.
 */
export class ExtractionLanguageModel extends Context.Tag("ExtractionLanguageModel")<
  ExtractionLanguageModel,
  LanguageModel.Service
>() {}

export class ProseLanguageModel extends Context.Tag("ProseLanguageModel")<
  ProseLanguageModel,
  LanguageModel.Service
>() {}
