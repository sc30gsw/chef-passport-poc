import type { PassportResult } from "~/data/schemas";
import type { PassportInputs } from "~/features/passport/api/build-passport";

/**
 * Everything the dashboard renders, joined so nothing downstream has to look a job or a visa up by
 * id. Pure data plumbing — no Effect, no network, no secrets — which is what lets the SSR loader and
 * the live stream reach the same shape from the same code rather than from two joins that can drift.
 */
export function joinPassportView(inputs: PassportInputs & Record<"result", PassportResult>) {
  const { jobs, persona, result, visas, vocabulary } = inputs;
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  return {
    countries: result.countries.map((country) => ({
      ...country,
      visaRequirements: visas.filter((visa) => visa.country === country.country),
    })),
    excludedJobs: result.excludedJobs.flatMap((excluded) => {
      const job = jobById.get(excluded.jobId);
      return job === undefined ? [] : [{ job, reasonJa: excluded.reasonJa }];
    }),
    jobMatches: result.jobMatches.flatMap((match) => {
      const job = jobById.get(match.jobId);
      return job === undefined ? [] : [{ job, match }];
    }),
    persona,
    proseSource: result.proseSource,
    skillSet: result.skillSet,
    timings: result.timings,
    translatedSkills: result.translatedSkills,
    vocabulary,
  };
}

/** Derived, so the components cannot drift from what the join actually produces. */
export type PassportView = ReturnType<typeof joinPassportView>;
