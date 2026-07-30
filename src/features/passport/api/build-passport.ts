import { Data, Effect, Schedule } from "effect";

import type {
  Country,
  Job,
  PassportResult,
  Persona,
  SkillSet,
  SkillVocabularyEntry,
  TranslatedSkill,
  VisaRequirement,
} from "~/data/schemas";
import { rankJobMatches } from "~/domain/scoring";
import { DEMO_COUNTRIES, assessAllCountries } from "~/domain/visa-eligibility";
import { explainCountry } from "~/features/passport/api/steps/explain-country";
import { explainJobMatch } from "~/features/passport/api/steps/explain-job-match";
import { extractSkills } from "~/features/passport/api/steps/extract-skills";
import { translateSkills } from "~/features/passport/api/steps/translate-skills";

/**
 * The four steps composed, with the deterministic/LLM boundary visible in the code: every value
 * that affects an outcome comes from `src/domain/`, and every `Effect` that touches a model returns
 * only a string.
 */
export class PipelineError extends Data.TaggedError("PipelineError")<{
  cause?: unknown;
  messageJa: string;
  step: string;
}> {}

/** The gateway documents model fallback but not retries — those are ours to write. */
const RESILIENCE = Schedule.exponential("500 millis").pipe(Schedule.intersect(Schedule.recurs(2)));

function resilient<A, E, R>(step: string, effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.timeout("30 seconds"),
    Effect.retry(RESILIENCE),
    Effect.mapError(
      (cause) => new PipelineError({ cause, messageJa: `${step}の生成に失敗しました`, step }),
    ),
  );
}

export type PassportInputs = {
  readonly jobs: readonly Job[];
  readonly persona: Persona;
  readonly visas: readonly VisaRequirement[];
  readonly vocabulary: readonly SkillVocabularyEntry[];
};

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

/**
 * Live pipeline. Judgement is computed first, then the model is asked for prose *about the result*
 * — never the other way round.
 */
export function buildPassport(inputs: PassportInputs) {
  return Effect.gen(function* () {
    const { jobs, persona, visas, vocabulary } = inputs;

    const skillSet = yield* resilient("スキル抽出", extractSkills(persona.resumeJa, vocabulary));

    const { countries, excluded, matches } = assessDeterministically(inputs);

    const translatedSkills: readonly TranslatedSkill[] = yield* resilient(
      "スキル翻訳",
      translateSkills(skillSet.skills, vocabulary),
    );

    const explainedCountries = yield* Effect.all(
      countries.map((assessment) =>
        resilient(
          "適合理由",
          explainCountry(
            persona,
            assessment,
            visas.filter((visa) => visa.country === assessment.country),
          ),
        ).pipe(Effect.map((explanationJa) => ({ ...assessment, explanationJa }))),
      ),
    );

    const explainedMatches = yield* Effect.all(
      matches.map((match) => {
        const job = jobs.find((item) => item.id === match.jobId);
        if (job === undefined) {
          return Effect.fail(
            new PipelineError({
              messageJa: `求人 ${match.jobId} が見つかりません`,
              step: "マッチング",
            }),
          );
        }
        return resilient("マッチ理由", explainJobMatch(persona, job, match)).pipe(
          Effect.map((reasonJa) => ({ ...match, reasonJa })),
        );
      }),
    );

    return {
      countries: explainedCountries,
      excludedJobs: excluded,
      jobMatches: explainedMatches,
      personaId: persona.id,
      proseSource: "llm",
      skillSet,
      timings: [],
      translatedSkills,
    } satisfies PassportResult;
  });
}
