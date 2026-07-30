import type {
  Country,
  CountryAssessment,
  Grade,
  Job,
  Persona,
  VisaAssessment,
  VisaRequirement,
} from "~/data/schemas";
import { LANGUAGE_LABELS_JA, languageRank } from "~/domain/language-level";
import {
  EXPERIENCE_BENCHMARK_YEARS,
  GENRE_DEMAND,
  NO_FLOOR_SALARY_FIT,
  SALARY_HEADROOM_TARGET,
  clamp01,
  toMonthlyAmount,
} from "~/domain/market";

/**
 * Deterministic visa eligibility. Plain functions over plain data — no Effect, no AI, no React.
 * The LLM never decides any of this; it only writes the sentence that describes the outcome.
 * See docs/adr/0003-deterministic-scoring.md.
 */

const WEIGHT_EXPERIENCE = 40;
const WEIGHT_LANGUAGE = 30;
const WEIGHT_SALARY = 20;
const WEIGHT_GENRE = 10;

const GRADE_EXCELLENT_MIN = 70;
const GRADE_GOOD_MIN = 40;

/** Business-level English earns full language marks; anything less is scored against it. */
const LANGUAGE_REFERENCE_RANK = languageRank("business");

/**
 * A job the persona could realistically be hired into: they clear its experience bar and at least
 * one of its required skills is in their vocabulary. Language is deliberately *not* a gate here —
 * it is a soft factor per docs/requirement.md, and gating on it would hide the language-gap story
 * behind an empty job list.
 */
export function isAttainableJob(persona: Persona, job: Job): boolean {
  return (
    persona.experienceYears >= job.minExperienceYears &&
    job.requiredSkills.some((skill) => persona.skills.includes(skill))
  );
}

/** Highest monthly salary the persona could actually reach in this country, 0 if none. */
function bestAttainableMonthly(
  persona: Persona,
  countryJobs: readonly Job[],
  requiresSponsor: boolean,
): number {
  return countryJobs.reduce((best, job) => {
    if (!isAttainableJob(persona, job)) return best;
    if (requiresSponsor && !job.sponsorshipAvailable) return best;
    return Math.max(best, toMonthlyAmount(job.salary));
  }, 0);
}

/**
 * Hard constraints **exclude** rather than subtract, and every violated one is reported. A single
 * reason would hide that Takahashi misses O-1 on both evidence and years.
 */
export function assessVisa(
  persona: Persona,
  visa: VisaRequirement,
  countryJobs: readonly Job[],
): VisaAssessment {
  const blockedReasonsJa: string[] = [];

  const hasSponsoringJob = countryJobs.some(
    (job) => job.sponsorshipAvailable && isAttainableJob(persona, job),
  );
  if (visa.requiresSponsor && !hasSponsoringJob) {
    blockedReasonsJa.push(
      `${visa.name}はスポンサー企業が前提だが、経験とスキルが噛み合うスポンサー可能な求人がない`,
    );
  }

  if (visa.maxAgeYears !== undefined && persona.age > visa.maxAgeYears) {
    blockedReasonsJa.push(`${persona.age}歳のため年齢上限${visa.maxAgeYears}歳を超過`);
  }

  if (persona.experienceYears < visa.minExperienceYears) {
    blockedReasonsJa.push(
      `経験${persona.experienceYears}年が必要年数${visa.minExperienceYears}年に届かない`,
    );
  }

  if (visa.requiresEvidenceProof && !persona.hasEvidenceProof) {
    blockedReasonsJa.push("受賞歴・メディア掲載などの卓越性を立証する実績がない");
  }

  if (visa.requiresSeasonalRole && !countryJobs.some((job) => job.isSeasonal)) {
    blockedReasonsJa.push(
      "季節性のある一時的な求人が前提だが、対象求人はすべて通年の常勤ポジション",
    );
  }

  const bestMonthly = bestAttainableMonthly(persona, countryJobs, visa.requiresSponsor);
  if (visa.minSalary !== undefined) {
    const floorMonthly = toMonthlyAmount(visa.minSalary);
    if (bestMonthly < floorMonthly) {
      blockedReasonsJa.push(
        `到達可能な月額 ${Math.round(bestMonthly)} ${visa.minSalary.currency} が給与下限 ${Math.round(floorMonthly)} ${visa.minSalary.currency} に届かない`,
      );
    }
  }

  const experienceFit = clamp01(
    persona.experienceYears / Math.max(visa.minExperienceYears, EXPERIENCE_BENCHMARK_YEARS),
  );
  const languageFit = clamp01(languageRank(persona.languageLevel) / LANGUAGE_REFERENCE_RANK);
  const salaryFit =
    visa.minSalary === undefined
      ? NO_FLOOR_SALARY_FIT
      : clamp01((bestMonthly / toMonthlyAmount(visa.minSalary) - 1) / SALARY_HEADROOM_TARGET);
  const genreFit = GENRE_DEMAND[visa.country][persona.primaryGenre];

  return {
    blockedReasonsJa,
    eligible: blockedReasonsJa.length === 0,
    score: Math.round(
      WEIGHT_EXPERIENCE * experienceFit +
        WEIGHT_LANGUAGE * languageFit +
        WEIGHT_SALARY * salaryFit +
        WEIGHT_GENRE * genreFit,
    ),
    visaId: visa.id,
  };
}

export function gradeFromScore(bestEligibleScore: number | null): Grade {
  if (bestEligibleScore === null) return "△";
  if (bestEligibleScore >= GRADE_EXCELLENT_MIN) return "◎";
  if (bestEligibleScore >= GRADE_GOOD_MIN) return "○";
  return "△";
}

/** Evaluated per visa, then reduced to one grade per country by the best eligible visa. */
export function assessCountry(
  persona: Persona,
  country: Country,
  visas: readonly VisaRequirement[],
  jobs: readonly Job[],
): CountryAssessment {
  const countryJobs = jobs.filter((job) => job.country === country);
  const countryVisas = visas.filter((visa) => visa.country === country);

  const assessments = countryVisas.map((visa) => assessVisa(persona, visa, countryJobs));
  const best = assessments.reduce<VisaAssessment | null>(
    (acc, item) => (item.eligible && (acc === null || item.score > acc.score) ? item : acc),
    null,
  );

  const sponsorFreeEligible = assessments.some(
    (item) =>
      item.eligible &&
      countryVisas.some((visa) => visa.id === item.visaId && !visa.requiresSponsor),
  );

  return {
    bestVisaId: best?.visaId ?? null,
    country,
    grade: gradeFromScore(best?.score ?? null),
    score: best?.score ?? 0,
    sponsorFreeEligible,
    visas: assessments,
  };
}

/** Countries in the demo's presentation order. */
export const DEMO_COUNTRIES = ["SG", "AU", "US"] as const satisfies readonly Country[];

export function assessAllCountries(
  persona: Persona,
  visas: readonly VisaRequirement[],
  jobs: readonly Job[],
): readonly CountryAssessment[] {
  return DEMO_COUNTRIES.map((country) => assessCountry(persona, country, visas, jobs));
}

/** Exported so the UI can label a language gap with the same wording the score used. */
export function languageGapLabelJa(level: Persona["languageLevel"]): string {
  return LANGUAGE_LABELS_JA[level];
}
