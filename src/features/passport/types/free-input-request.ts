import { Schema } from "effect";

import { LanguageLevel } from "~/data/schemas";

/**
 * Free-input mode's whole request. It lives apart from the server function for the same reason
 * `passport-stream-request.ts` does: `inputValidator` runs on the client too, so the schema must be
 * reachable from the browser while the handler body — pipeline, loaders, gateway client — is not.
 * See .claude/rules/web/tanstack-start.md.
 *
 * ## Why `age` and `languageLevel` are fields rather than extracted
 *
 * The pipeline needs a `Persona`, and a `Persona` carries more than a résumé states. Splitting it
 * is the sharpest design question in this feature, and the deterministic/LLM boundary decides it
 * (.claude/rules/web/ai-pipeline.md):
 *
 * - `skills`, `experienceYears`, `primaryGenre` are **stated in the résumé**. Reading them out of
 *   prose is extraction — step 1's entire job — and the extraction is decoded against `SkillSet`,
 *   so an invented skill id fails at the schema rather than reaching the score.
 * - `age`, `languageLevel` and `hasEvidenceProof` are **not reliably stated** and are pure
 *   judgement inputs: age fires visa 417's cap, language level carries 30% of the visa fit score,
 *   and evidence of excellence is O-1's hard gate. A model guessing them would move a judgement
 *   input into a prompt, which is exactly what the rule forbids. So the form declares them.
 *
 * Consequence worth stating: what the résumé says about language level is ignored in favour of the
 * declared value, so the screen never shows a level the judgement did not use.
 */

/** Schema-enforced, not UI-enforced: a UI-only cap is bypassable. See common/security.md. */
export const MAX_RESUME_LENGTH = 2000;

/** Below this there is nothing to extract from, and the run would burn a paid call to say so. */
const MIN_RESUME_LENGTH = 50;

/**
 * Bounded on both sides so the 417 age cap is exercised by a real number rather than by a typo.
 * Not a legal minimum — a working age no chef career can predate, and a ceiling past every visa cap.
 */
const MIN_AGE_YEARS = 15;
const MAX_AGE_YEARS = 80;

export const FreeInputRequest = Schema.Struct({
  age: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(MIN_AGE_YEARS),
    Schema.lessThanOrEqualTo(MAX_AGE_YEARS),
  ),
  /** Awards or press coverage — O-1's hard gate. Absent means "not claimed", never "unknown". */
  hasEvidenceProof: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  languageLevel: LanguageLevel,
  resume: Schema.String.pipe(
    Schema.minLength(MIN_RESUME_LENGTH),
    Schema.maxLength(MAX_RESUME_LENGTH),
  ),
});
export type FreeInputRequest = Schema.Schema.Type<typeof FreeInputRequest>;
