import { createServerFn } from "@tanstack/react-start";
import { Effect, Exit, Schema } from "effect";

import { lookupCachedPassport } from "~/data/cache-index";
import { loadJobs, loadPersona, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";

const PassportRequest = Schema.Struct({
  personaId: Schema.String,
});

/**
 * Everything the dashboard renders, joined server-side so the client never has to look a job or a
 * visa up by id. Returns plain serializable data only — no Effect, Exit, Option or Error subclass
 * may cross this boundary. See .claude/rules/typescript/effect-patterns.md.
 *
 * Kept as a plain exported function so it can be unit-tested without the `createServerFn` wrapper.
 */
export async function loadPassportView(personaId: string) {
  const program = Effect.gen(function* () {
    const persona = yield* loadPersona(personaId);
    const visas = yield* loadVisaRequirements;
    const jobs = yield* loadJobs;
    const vocabulary = yield* loadSkillVocabulary;

    return { jobs, persona, visas, vocabulary };
  });

  const exit = await Effect.runPromiseExit(program);

  if (Exit.isFailure(exit)) {
    return { message: `ペルソナ ${personaId} を読み込めませんでした`, ok: false as const };
  }

  const result = lookupCachedPassport(personaId);

  if (result === undefined) {
    return { message: `${personaId} の事前生成結果がありません`, ok: false as const };
  }

  const { jobs, persona, visas, vocabulary } = exit.value;
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  return {
    data: {
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
    },
    ok: true as const,
  };
}

/** The successful payload, derived so the components cannot drift from what the loader returns. */
export type PassportView = Extract<
  Awaited<ReturnType<typeof loadPassportView>>,
  { ok: true }
>["data"];

export const loadPassportServer = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => Schema.decodeUnknownSync(PassportRequest)(data))
  .handler(({ data }) => loadPassportView(data.personaId));
