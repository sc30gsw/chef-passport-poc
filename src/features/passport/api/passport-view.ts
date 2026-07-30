import type { Layer } from "effect";
import { Cause, Effect, Exit, Option } from "effect";

import type { ChefDataError } from "~/data/loaders";
import { loadJobs, loadPersona, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import type { PassportPipeline, PipelineError } from "~/features/passport/api/pipeline-service";
import { runPassportPipeline } from "~/features/passport/api/pipeline-service";
import { joinPassportView } from "~/features/passport/utils/join-passport-view";

/** Both failure types carry a Japanese sentence of their own; only a defect gets the generic one. */
function failureMessageJa(personaId: string, cause: Cause.Cause<ChefDataError | PipelineError>) {
  const failure = Cause.failureOption(cause);

  if (Option.isNone(failure)) return `ペルソナ ${personaId} を読み込めませんでした`;

  return failure.value._tag === "PipelineError" ? failure.value.messageJa : failure.value.message;
}

/**
 * Everything the dashboard renders, joined server-side so the client never has to look a job or a
 * visa up by id. Returns plain serializable data only — no Effect, Exit, Option or Error subclass
 * may cross this boundary. See .claude/rules/typescript/effect-patterns.md.
 *
 * The result comes from the `PassportPipeline` tag, never from a cache lookup of its own, and the
 * Layer arrives as an argument: this function has no opinion on whether the run was replayed or
 * generated, which is what lets the live path land without touching it.
 *
 * It lives apart from `passport-server.ts` so that the server function's module holds nothing but
 * the boundary. `tanstackStart()` strips the handler from the client build and drops the imports
 * only that handler referenced, so keeping this out of the boundary module is what keeps the data
 * loaders, the committed cache and the gateway client out of the browser bundle.
 */
export async function loadPassportView(personaId: string, pipeline: Layer.Layer<PassportPipeline>) {
  const program = Effect.gen(function* () {
    const persona = yield* loadPersona(personaId);
    const visas = yield* loadVisaRequirements;
    const jobs = yield* loadJobs;
    const vocabulary = yield* loadSkillVocabulary;

    const result = yield* runPassportPipeline({ jobs, persona, visas, vocabulary });

    return { jobs, persona, result, visas, vocabulary };
  }).pipe(Effect.provide(pipeline));

  const exit = await Effect.runPromiseExit(program);

  if (Exit.isFailure(exit)) {
    return { message: failureMessageJa(personaId, exit.cause), ok: false as const };
  }

  return { data: joinPassportView(exit.value), ok: true as const };
}

/**
 * Re-exported so components keep one import path for the payload. The join itself lives in
 * `~/features/passport/utils/join-passport-view`, because the live path joins the streamed result
 * in the browser and must not reach into this module's Effect and data-loading imports.
 */
export type { PassportView } from "~/features/passport/utils/join-passport-view";
