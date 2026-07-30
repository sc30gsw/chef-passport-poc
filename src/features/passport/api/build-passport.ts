import type {
  Country,
  Job,
  PassportResult,
  Persona,
  SkillSet,
  SkillVocabularyEntry,
  VisaRequirement,
} from "~/data/schemas";
import { rankJobMatches } from "~/domain/scoring";
import { DEMO_COUNTRIES, assessAllCountries } from "~/domain/visa-eligibility";
import type { FreeInputRequest } from "~/features/passport/types/free-input-request";

/**
 * The deterministic half of the pipeline, assembled. Nothing in this module touches Effect, a model
 * or the network: every value that affects an outcome comes from `src/domain/`, which is what makes
 * the judgement provable without a harness.
 *
 * The live pipeline lives in `pipeline-service.ts` and calls straight into `assessDeterministically`
 * for exactly these numbers, so there is one implementation of the judgement and not two.
 */

export type PassportInputs = {
  readonly jobs: readonly Job[];
  readonly persona: Persona;
  readonly visas: readonly VisaRequirement[];
  readonly vocabulary: readonly SkillVocabularyEntry[];
};

/**
 * Free input's inputs: the same static data, but no `Persona` yet. Step 1 has to run before one
 * exists, because a résumé is the only thing the caller supplied.
 */
export type FreeInputInputs = Omit<PassportInputs, "persona"> & {
  readonly profile: FreeInputRequest;
};

/** Not a real chef, and never rendered as one — the UI labels free-input runs from this id. */
export const FREE_INPUT_PERSONA_ID = "free-input";

const FREE_INPUT_PERSONA_NAME = "自由入力のシェフ";

/**
 * Assembles the `Persona` the deterministic judgement runs on, out of the two halves free input
 * arrives in: what the model read from the résumé, and what the form declared.
 *
 * Pure and synchronous on purpose. Nothing here decides anything — it only says which half owns
 * which field, and `free-input-request.ts` records why the split falls where it does.
 */
export function personaFromFreeInput(profile: FreeInputRequest, skillSet: SkillSet): Persona {
  return {
    age: profile.age,
    experienceYears: skillSet.experienceYears,
    hasEvidenceProof: profile.hasEvidenceProof,
    id: FREE_INPUT_PERSONA_ID,
    languageLevel: profile.languageLevel,
    name: FREE_INPUT_PERSONA_NAME,
    primaryGenre: skillSet.primaryGenre,
    resumeJa: profile.resume,
    skills: skillSet.skills,
  };
}

/** The deterministic half. No Effect, no model, no network. */
export function assessDeterministically(inputs: Omit<PassportInputs, "vocabulary">) {
  const { jobs, persona, visas } = inputs;
  const countries = assessAllCountries(persona, visas, jobs);

  const sponsorFreeByCountry = Object.fromEntries(
    DEMO_COUNTRIES.map((country) => [
      country,
      countries.find((item) => item.country === country)?.sponsorFreeEligible ?? false,
    ]),
  ) as Record<Country, boolean>;

  return { countries, ...rankJobMatches(persona, jobs, sponsorFreeByCountry) };
}

/**
 * Deterministic fallback wording, for when prose generation is unavailable. It is never passed off
 * as model output: `PassportResult.proseSource` records which of the two produced the text, and the
 * UI reads that field.
 */
export function deterministicProse(inputs: Omit<PassportInputs, "vocabulary">): PassportResult {
  const { persona } = inputs;
  const { countries, excluded, matches } = assessDeterministically(inputs);

  const skillSet: SkillSet = {
    experienceYears: persona.experienceYears,
    languageLevel: persona.languageLevel,
    primaryGenre: persona.primaryGenre,
    skills: persona.skills,
    summaryJa: `経験${persona.experienceYears}年、${persona.primaryGenre}を専門とするシェフ。`,
  };

  return {
    countries: countries.map((country) => ({
      ...country,
      explanationJa:
        country.bestVisaId === null
          ? `適合するビザがありません。理由: ${country.visas
              .flatMap((visa) => visa.blockedReasonsJa)
              .join(" / ")}`
          : `適合度 ${country.grade}。スコア ${country.score} で ${country.bestVisaId} が通ります。`,
    })),
    excludedJobs: excluded,
    jobMatches: matches.map((match) => ({
      ...match,
      reasonJa:
        match.notesJa.length === 0
          ? `スコア ${match.score}。要件を満たしています。`
          : `スコア ${match.score}。${match.notesJa.join("、")}。`,
    })),
    personaId: persona.id,
    proseSource: "deterministic",
    skillSet,
    timings: [],
    translatedSkills: [],
  };
}
