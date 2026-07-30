import type { LanguageModel } from "@effect/ai";
import { Effect, Layer, Schema } from "effect";

import type { ModelRole } from "~/lib/model-roles";
import {
  EXTRACTION_MODEL,
  ExtractionLanguageModel,
  PROSE_MODEL,
  ProseLanguageModel,
} from "~/lib/model-roles";

/**
 * Stub `LanguageModel` Layers. The real API is never called from a test — see
 * .claude/rules/common/testing.md — and the point of the live-path tests is that the *structure*
 * runs, since the judgement it wraps is already covered by the domain tests.
 *
 * `generateObject` is the only method the four steps use, so the stubs implement just that. The
 * cast is confined to this module rather than repeated in every test file.
 *
 * Every helper here fills **both** role tags with the same behaviour, because most tests are about
 * the pipeline's shape and do not care which model answered. `splitModelLayer` is the exception:
 * it is the one that distinguishes the two, and it is what proves the split.
 */
type StubResponses = Readonly<Record<string, unknown>>;

type GenerateObjectOptions = {
  readonly objectName?: string;
  readonly prompt?: string;
  readonly schema?: Schema.Schema<unknown, unknown, never>;
};

type GenerateObject = (
  options: GenerateObjectOptions,
) => Effect.Effect<{ value: unknown }, unknown>;

function modelService(generateObject: GenerateObject) {
  return { generateObject } as unknown as LanguageModel.Service;
}

/** What every helper below returns: both role tags filled, nothing else required. */
export type StubModelLayer = Layer.Layer<ExtractionLanguageModel | ProseLanguageModel>;

function modelLayer(generateObject: GenerateObject): StubModelLayer {
  return Layer.merge(
    Layer.succeed(ExtractionLanguageModel, modelService(generateObject)),
    Layer.succeed(ProseLanguageModel, modelService(generateObject)),
  );
}

/** Answers every step from a fixed table, keyed by the step's `objectName`. */
export function stubModelLayer(byObjectName: StubResponses) {
  return modelLayer(({ objectName }) => Effect.succeed({ value: byObjectName[objectName ?? ""] }));
}

/** Fails the first `failures` calls, then behaves like the stub — a transient gateway blip. */
export function flakyModelLayer(failures: number, byObjectName: StubResponses) {
  let remaining = failures;

  return modelLayer(({ objectName }) => {
    if (remaining > 0) {
      remaining -= 1;
      return Effect.fail(new Error("transient"));
    }

    return Effect.succeed({ value: byObjectName[objectName ?? ""] });
  });
}

/** Never recovers. Drives the pipeline's terminal `Failed` event. */
export function failingModelLayer() {
  return modelLayer(() => Effect.fail(new Error("boom")));
}

/**
 * Proves a code path did **not** reach the model. `calls` is the assertion; the die is the safety
 * net, so a test that regresses fails on the count and on the run rather than passing quietly.
 */
export function countingModelLayer() {
  const calls = { count: 0 };

  return {
    calls,
    layer: modelLayer(() => {
      calls.count += 1;
      return Effect.die(new Error("モデルを呼んではいけない経路で呼ばれた"));
    }),
  };
}

/**
 * Holds one step open until `gate` settles. Used by the incremental-delivery test: everything
 * before the gated step has to reach the consumer while the run is still unfinished.
 */
export function gatedModelLayer(
  gatedObjectName: string,
  gate: Promise<void>,
  byObjectName: StubResponses,
) {
  return modelLayer(({ objectName }) =>
    objectName === gatedObjectName
      ? Effect.promise(() => gate).pipe(
          Effect.map(() => ({ value: byObjectName[objectName ?? ""] })),
        )
      : Effect.succeed({ value: byObjectName[objectName ?? ""] }),
  );
}

/**
 * Fails only the named steps. Free input's prose fallback needs a run where the extraction lands
 * and the wording does not — the one case where a deterministic result still exists to report.
 */
export function selectiveFailModelLayer(
  failingObjectNames: readonly string[],
  byObjectName: StubResponses,
) {
  return modelLayer(({ objectName }) =>
    failingObjectNames.includes(objectName ?? "")
      ? Effect.fail(new Error(`${objectName} は失敗する設定`))
      : Effect.succeed({ value: byObjectName[objectName ?? ""] }),
  );
}

/**
 * Decodes its canned answer against the schema the step passed, the way the real
 * `generateObject` does. Everything else here skips that decode, which is fine for the steps whose
 * subject is the pipeline's shape — but the prompt-injection test's whole claim is that the schema
 * is what stops a model from inventing a skill, so that path needs the decode to actually run.
 *
 * `prompts` records what was sent, so a test can assert the résumé reached the model as data.
 */
export function schemaCheckedModelLayer(byObjectName: StubResponses) {
  const prompts: string[] = [];

  return {
    layer: modelLayer(({ objectName, prompt, schema }) => {
      prompts.push(prompt ?? "");
      const value = byObjectName[objectName ?? ""];

      return schema === undefined
        ? Effect.succeed({ value })
        : Schema.decodeUnknown(schema)(value).pipe(Effect.map((decoded) => ({ value: decoded })));
    }),
    prompts,
  };
}

/**
 * The one stub that tells the two roles apart. Each role answers with the gateway slug it stands
 * for, so a test can assert which model a given step actually reached — the whole claim of the
 * model split, and the only part of it observable without a network call.
 */
export function splitModelLayer(byObjectName: StubResponses) {
  const calls: { modelId: string; objectName: string }[] = [];

  const roleService = (role: ModelRole, modelId: string) =>
    modelService(({ objectName }) => {
      calls.push({ modelId, objectName: objectName ?? "" });
      return Effect.succeed({ value: byObjectName[objectName ?? ""] });
    });

  return {
    calls,
    layer: Layer.merge(
      Layer.succeed(ExtractionLanguageModel, roleService("extraction", EXTRACTION_MODEL)),
      Layer.succeed(ProseLanguageModel, roleService("prose", PROSE_MODEL)),
    ),
  };
}

/**
 * Fails a role's first `failures` calls and then recovers, so a test can prove the retry schedule
 * covers the prose steps too rather than only the extraction the pipeline starts with.
 */
export function flakyRoleModelLayer(
  role: ModelRole,
  failures: number,
  byObjectName: StubResponses,
) {
  let remaining = failures;

  const flaky = modelService(({ objectName }) => {
    if (remaining > 0) {
      remaining -= 1;
      return Effect.fail(new Error("transient"));
    }

    return Effect.succeed({ value: byObjectName[objectName ?? ""] });
  });
  const healthy = modelService(({ objectName }) =>
    Effect.succeed({ value: byObjectName[objectName ?? ""] }),
  );

  return Layer.merge(
    Layer.succeed(ExtractionLanguageModel, role === "extraction" ? flaky : healthy),
    Layer.succeed(ProseLanguageModel, role === "prose" ? flaky : healthy),
  );
}

/** Shaped for `sato-takumi`, but nothing in the pipeline is persona-specific about it. */
export const STUB_RESPONSES = {
  countryExplanation: { explanationJa: "スタブの説明文" },
  jobMatchReason: { reasonJa: "スタブの理由文" },
  skillSet: {
    experienceYears: 8,
    languageLevel: "conversational",
    primaryGenre: "sushi",
    skills: ["sashimi-slicing", "yanagiba-knife"],
    summaryJa: "スタブの要約",
  },
  translations: {
    translations: [
      {
        localEn: "Slicing white-fish sashimi",
        skillId: "sashimi-slicing",
        sourceJa: "白身の刺身引き",
      },
    ],
  },
} as const satisfies StubResponses;
