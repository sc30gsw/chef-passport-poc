---
description: Effect 3.22 patterns — tagged errors, Service/Layer boundaries, retry/timeout/fallback, no leaking Effect across serialization
globs: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"]
alwaysApply: true
---

# Effect Patterns

Pinned to **`effect@3.22.x`**. Do NOT follow `Effect-TS/effect` `main` on GitHub — it is already `4.0.0-beta`, whose API differs and which `@effect/ai` does not target. Docs: https://effect.website/docs/

## Where Effect applies

Effect owns the **AI pipeline** and the **data layer**. It does not own the UI.

| Layer                                  | Effect?                                     |
| -------------------------------------- | ------------------------------------------- |
| `src/domain/`                          | No — plain pure functions, no Effect import |
| `src/data/`                            | Yes — `Schema.decodeUnknown` on load        |
| `src/features/*/api/`                  | Yes — services, Layers, pipeline steps      |
| `src/features/*/components/`, `hooks/` | No — plain React consuming plain data       |

The boundary is deliberate: React owns rendering, Effect owns fallible orchestration.

## Tagged errors

Use `Data.TaggedError` for anything crossing a function boundary. Keep context on the error.

```typescript
import { Data } from "effect";

class VisaDataError extends Data.TaggedError("VisaDataError")<{
  cause?: unknown;
  country: string;
  message: string;
}> {}
```

Avoid `Effect<A, unknown, R>` — an untyped error channel defeats the reason for using Effect.

## Compose with `Effect.gen`, do not unwrap early

```typescript
// CORRECT: failures short-circuit
const pipeline = Effect.gen(function* () {
  const skills = yield* extractSkills(resume);
  const translated = yield* translateSkills(skills);
  return { skills, translated };
});

// WRONG: runPromise in the middle of composition
const skills = await Effect.runPromise(extractSkills(resume));
```

`Effect.runPromise` appears only at the outermost boundary: a server function handler, or `scripts/generate-passport.ts`.

## Services and Layers

One composition point: `src/lib/runtime.ts`. Layers never live inside a feature.

```typescript
// src/features/passport/api/pipeline-service.ts
export class PassportPipeline extends Context.Tag("PassportPipeline")<
  PassportPipeline,
  { readonly run: (resume: string) => Stream.Stream<PipelineEvent, PipelineError> }
>() {}

// two interchangeable implementations — the source swaps, the interface does not
export const PipelineLive = Layer.effect(PassportPipeline, makeLivePipeline);
export const PipelineFromCache = Layer.succeed(PassportPipeline, makeCachePipeline);
```

This swap is the core design claim of the project. Preset personas and free input run the **same** `Stream<PipelineEvent>`; only the Layer differs.

## Retry / timeout / fallback

```typescript
import { Effect, Schedule } from "effect";

const resilient = step.pipe(
  Effect.timeout("30 seconds"),
  Effect.retry(Schedule.exponential("500 millis").pipe(Schedule.intersect(Schedule.recurs(2)))),
  Effect.orElse(() => fallbackToCache),
);
```

AI Gateway documents model **fallback** and provider ordering, but not automatic retries — retries are yours to write.

## Never leak Effect across a serialization boundary

Server functions and route loaders must return plain serializable data. `Effect`, `Exit`, `Cause`, `Option`, `Either`, and `TaggedError` instances are not serializable.

```typescript
// CORRECT: convert at the boundary
const exit = await Effect.runPromiseExit(program);
return Exit.isSuccess(exit)
  ? { ok: true as const, data: exit.value }
  : { ok: false as const, message: renderError(exit.cause) };

// WRONG: returning Effect internals to the client
return Effect.runSyncExit(program);
```

## Schema lives in effect

`effect/Schema` is built into `effect@3.22`. Do NOT install `@effect/schema` (merged into core) or `zod` (redundant). See [effect-schema.md](./effect-schema.md).

## Testing

`@effect/vitest` is **unusable here** — its peer is `vitest ^3.2.0` while Vite+ bundles 4.1.9, and installing it violates the no-direct-vitest rule. Use `vite-plus/test` with a local helper. See [../common/testing.md](../common/testing.md).

## Related

- `effect-ts` skill — repository Effect patterns
