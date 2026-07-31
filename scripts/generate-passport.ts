import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Effect, Layer, Schema } from "effect";

import {
  Job,
  PassportResult,
  Persona,
  SkillVocabularyEntry,
  VisaRequirement,
} from "../src/data/schemas.ts";
import { deterministicProse } from "../src/features/passport/api/build-passport.ts";
import {
  PipelineLive,
  runPassportPipeline,
} from "../src/features/passport/api/pipeline-service.ts";
import { anthropicLayer, extractionModelLayer, proseModelLayer } from "../src/lib/ai-client.ts";

/**
 * Regenerates the committed pipeline cache. Committed and re-runnable on purpose: it is the evidence
 * the pipeline actually runs, and it is what makes the preset demo reproducible, API-key-free and
 * immune to network failure at demo time.
 *
 * Cache files are generated artifacts. Never hand-edit them — fix this script and re-run.
 *
 *   vp run generate:passport              # live; needs AI_GATEWAY_API_KEY and gateway access
 *   vp run generate:passport -- --offline # deterministic prose only, recorded as such
 *
 * Runs under plain Node, so imports are relative with explicit `.ts` extensions and JSON is read
 * with `node:fs` rather than imported (Node would demand an import attribute).
 */

const dataDir = new URL("../src/data/", import.meta.url);
const cacheDir = new URL("./cache/", dataDir);

const PERSONA_IDS = ["sato-takumi", "suzuki-haruka", "takahashi-kenta"] as const;

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, dataDir)), "utf8"));
}

function decode<A, I>(schema: Schema.Schema<A, I>, raw: unknown, resource: string): A {
  try {
    return Schema.decodeUnknownSync(schema)(raw);
  } catch (cause) {
    throw new Error(`${resource} failed to decode: ${String(cause)}`);
  }
}

const isOffline = process.argv.includes("--offline");

const visas = decode(
  Schema.Array(VisaRequirement),
  readJson("visa-requirements.json"),
  "visa-requirements.json",
);
const jobs = decode(Schema.Array(Job), readJson("jobs.json"), "jobs.json");
const vocabulary = decode(
  Schema.Array(SkillVocabularyEntry),
  readJson("skill-vocabulary.json"),
  "skill-vocabulary.json",
);
const personas = PERSONA_IDS.map((id) =>
  decode(Persona, readJson(`personas/${id}.json`), `personas/${id}.json`),
);

/**
 * Drives the real `PipelineLive` stream through the same `PassportPipeline` tag the app resolves, so
 * the cache carries genuinely measured step timings.
 *
 * The Layer stack is composed here rather than taken from `src/lib/runtime.ts` for a reason that is
 * not a preference: this file runs under plain Node, where the `~/` alias does not resolve and the
 * statically imported cache JSON that `runtime.ts` pulls in cannot be loaded. The *consumption* is
 * shared even though the composition cannot be — including the model split, so a regenerated cache
 * carries sonnet-5 prose exactly as a live run would.
 */
function generateLive(persona: Persona): Promise<PassportResult> {
  return Effect.runPromise(
    runPassportPipeline({ jobs, persona, visas, vocabulary }).pipe(
      Effect.provide(PipelineLive),
      Effect.provide(Layer.merge(extractionModelLayer(), proseModelLayer())),
      Effect.provide(anthropicLayer()),
    ),
  );
}

/**
 * Offline substitute. Records `proseSource: "deterministic"` and the time it actually measured, so
 * nothing here can be mistaken for model output. Every *judgement* is identical to the live run —
 * only the wording differs, which is exactly what the architecture claims.
 */
function generateOffline(persona: Persona): PassportResult {
  const startedAt = performance.now();
  const result = deterministicProse({ jobs, persona, visas });
  const elapsedMs = performance.now() - startedAt;

  return {
    ...result,
    timings: [
      { durationMs: 0, step: "extract" },
      { durationMs: elapsedMs, step: "visa" },
      { durationMs: 0, step: "translate" },
      { durationMs: 0, step: "match" },
    ],
  };
}

async function main() {
  mkdirSync(fileURLToPath(cacheDir), { recursive: true });

  if (isOffline) {
    process.stdout.write(
      "⚠ --offline: 決定論的な判定のみを書き出します。文章はLLM生成ではありません" +
        '（proseSource: "deterministic" として記録されます）\n',
    );
  }

  for (const persona of personas) {
    const result = isOffline ? generateOffline(persona) : await generateLive(persona);

    // Decode before writing: a cache file that cannot be decoded is worse than no cache file.
    const validated = decode(PassportResult, result, `cache/${persona.id}.json`);
    const target = fileURLToPath(new URL(`${persona.id}.json`, cacheDir));

    writeFileSync(target, `${JSON.stringify(validated, null, 2)}\n`, "utf8");

    const totalMs = validated.timings.reduce((sum, timing) => sum + timing.durationMs, 0);
    process.stdout.write(
      `✓ ${persona.id}: matches=${validated.jobMatches.length} ` +
        `excluded=${validated.excludedJobs.length} prose=${validated.proseSource} ` +
        `measured=${Math.round(totalMs)}ms\n`,
    );
  }
}

await main();
