import { Data, Effect, Schema } from "effect";

import jobsRaw from "~/data/jobs.json";
import satoRaw from "~/data/personas/sato-takumi.json";
import suzukiRaw from "~/data/personas/suzuki-haruka.json";
import takahashiRaw from "~/data/personas/takahashi-kenta.json";
import { Job, Persona, SkillVocabularyEntry, VisaRequirement } from "~/data/schemas";
import skillVocabularyRaw from "~/data/skill-vocabulary.json";
import visaRequirementsRaw from "~/data/visa-requirements.json";

/**
 * `resolveJsonModule` is on, so these imports carry a literal type — which is *not* a guarantee
 * they match the schema. Every one is decoded anyway, and `ParseError` is wrapped in a domain
 * tagged error so the UI never sees Effect internals.
 */
export class ChefDataError extends Data.TaggedError("ChefDataError")<{
  cause?: unknown;
  message: string;
  resource: string;
}> {}

function decodeResource<A, I>(
  schema: Schema.Schema<A, I>,
  resource: string,
  raw: unknown,
): Effect.Effect<A, ChefDataError> {
  return Schema.decodeUnknown(schema)(raw).pipe(
    Effect.mapError(
      (cause) =>
        new ChefDataError({ cause, message: `${resource} がスキーマに一致しません`, resource }),
    ),
  );
}

export const loadVisaRequirements = decodeResource(
  Schema.Array(VisaRequirement),
  "visa-requirements.json",
  visaRequirementsRaw,
);

export const loadJobs = decodeResource(Schema.Array(Job), "jobs.json", jobsRaw);

export const loadSkillVocabulary = decodeResource(
  Schema.Array(SkillVocabularyEntry),
  "skill-vocabulary.json",
  skillVocabularyRaw,
);

/** Presentation order for screen 1 — the interviewer picks from these three, in this order. */
const PERSONA_SOURCES = [
  { id: "sato-takumi", raw: satoRaw },
  { id: "suzuki-haruka", raw: suzukiRaw },
  { id: "takahashi-kenta", raw: takahashiRaw },
] as const;

export const loadPersonas = Effect.all(
  PERSONA_SOURCES.map(({ id, raw }) => decodeResource(Persona, `personas/${id}.json`, raw)),
);

export function loadPersona(personaId: string): Effect.Effect<Persona, ChefDataError> {
  return loadPersonas.pipe(
    Effect.flatMap((personas) => {
      const found = personas.find((persona) => persona.id === personaId);
      return found === undefined
        ? Effect.fail(
            new ChefDataError({
              message: `ペルソナ ${personaId} は存在しません`,
              resource: "personas",
            }),
          )
        : Effect.succeed(found);
    }),
  );
}
