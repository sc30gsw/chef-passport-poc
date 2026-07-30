import type { Country, ExcludedJob, Job, JobMatch, Persona } from "~/data/schemas";
import { LANGUAGE_LABELS_JA, languageRank } from "~/domain/language-level";
import { COUNTRY_REFERENCE_MONTHLY, GENRE_FAMILY, clamp01, toMonthlyAmount } from "~/domain/market";

/**
 * Deterministic job-match score. The LLM writes the reason sentence for a job; it never decides
 * the number or the ordering. See docs/adr/0003-deterministic-scoring.md.
 */

const WEIGHT_SKILLS = 40;
const WEIGHT_EXPERIENCE = 20;
const WEIGHT_LANGUAGE = 20;
const WEIGHT_GENRE = 10;
const WEIGHT_SALARY = 10;

/** Credit for a venue in the same culinary family as the chef's own. */
const ADJACENT_GENRE_FIT = 0.5;

export function scoreJobMatch(persona: Persona, job: Job): JobMatch {
  const notesJa: string[] = [];

  const matchedSkills = job.requiredSkills.filter((skill) => persona.skills.includes(skill));
  const skillFit = matchedSkills.length / job.requiredSkills.length;
  if (skillFit < 1) {
    const missingCount = job.requiredSkills.length - matchedSkills.length;
    notesJa.push(`必要スキル${job.requiredSkills.length}件のうち${missingCount}件が未充足`);
  }

  const experienceFit =
    job.minExperienceYears === 0 ? 1 : clamp01(persona.experienceYears / job.minExperienceYears);
  if (experienceFit < 1) {
    notesJa.push(`必要経験${job.minExperienceYears}年に対して${persona.experienceYears}年で不足`);
  }

  const requiredRank = languageRank(job.requiredLanguage);
  const languageFit =
    requiredRank === 0 ? 1 : clamp01(languageRank(persona.languageLevel) / requiredRank);
  if (languageFit < 1) {
    notesJa.push(
      `要求語学「${LANGUAGE_LABELS_JA[job.requiredLanguage]}」に対して「${LANGUAGE_LABELS_JA[persona.languageLevel]}」のため語学面で減点`,
    );
  }

  const isSameGenre = job.venueType === persona.primaryGenre;
  const isAdjacentGenre = GENRE_FAMILY[job.venueType] === GENRE_FAMILY[persona.primaryGenre];
  const genreFit = isSameGenre ? 1 : isAdjacentGenre ? ADJACENT_GENRE_FIT : 0;
  if (!isSameGenre) {
    notesJa.push("専門ジャンルとの一致度が低い");
  }

  const salaryFit = clamp01(toMonthlyAmount(job.salary) / COUNTRY_REFERENCE_MONTHLY[job.country]);

  return {
    jobId: job.id,
    notesJa,
    score: Math.round(
      WEIGHT_SKILLS * skillFit +
        WEIGHT_EXPERIENCE * experienceFit +
        WEIGHT_LANGUAGE * languageFit +
        WEIGHT_GENRE * genreFit +
        WEIGHT_SALARY * salaryFit,
    ),
  };
}

/**
 * A job that will not sponsor is only reachable on a visa that needs no sponsor. When the persona
 * has no such visa in that country the job is **excluded with a reason** rather than scored to
 * zero — a zero would be indistinguishable from a bad fit.
 */
export function rankJobMatches(
  persona: Persona,
  jobs: readonly Job[],
  sponsorFreeByCountry: Readonly<Record<Country, boolean>>,
): { excluded: readonly ExcludedJob[]; matches: readonly JobMatch[] } {
  const excluded: ExcludedJob[] = [];
  const matches: JobMatch[] = [];

  for (const job of jobs) {
    if (!job.sponsorshipAvailable && !sponsorFreeByCountry[job.country]) {
      excluded.push({
        jobId: job.id,
        reasonJa:
          "ビザスポンサー不可の求人。この国で取得可能なスポンサー不要のビザがないため対象外",
      });
      continue;
    }
    matches.push(scoreJobMatch(persona, job));
  }

  // Tie-break on id so the ranked list is stable across runs and the committed cache stays
  // byte-reproducible.
  return {
    excluded,
    matches: matches.toSorted((a, b) =>
      b.score === a.score ? a.jobId.localeCompare(b.jobId) : b.score - a.score,
    ),
  };
}
