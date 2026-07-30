---
description: effect/Schema as the single validation layer — decode at boundaries, Literal unions, structured-output schemas, cache contract test
globs: ["src/**/*.ts", "scripts/**/*.ts"]
alwaysApply: true
---

# effect/Schema

`Schema` ships inside `effect@3.22` (`effect/Schema`). It is the **only** validation library in this project.

```typescript
// CORRECT
import { Schema } from "effect";

// WRONG: merged into effect core
import * as Schema from "@effect/schema/Schema";

// WRONG: redundant here
import { z } from "zod";
```

## Schema is the source of truth for types

Define the schema, derive the type. Never hand-write a type and a validator separately.

```typescript
const LanguageLevel = Schema.Literal("none", "basic", "conversational", "business");
type LanguageLevel = Schema.Schema.Type<typeof LanguageLevel>;

const VisaRequirement = Schema.Struct({
  country: Schema.Literal("SG", "AU", "US"),
  maxAgeYears: Schema.optional(Schema.Number),
  minSalary: Schema.Struct({ amount: Schema.Number, currency: Schema.String }),
  name: Schema.String,
  requiresSponsor: Schema.Boolean,
  sourceUrl: Schema.String,
});
type VisaRequirement = Schema.Schema.Type<typeof VisaRequirement>;
```

Prefer `Schema.Literal` unions over `string` for anything the deterministic scoring functions compare. A widened `string` moves the failure from decode time to scoring time.

## Decode at every boundary

Three boundaries here require a decode: static JSON load, committed cache load, free-input request.

```typescript
// CORRECT
const visas = yield * Schema.decodeUnknown(Schema.Array(VisaRequirement))(rawJson);

// WRONG: a cast is not validation
const visas = rawJson as VisaRequirement[];
```

`resolveJsonModule` is on, so imported JSON carries a literal type — that is **not** a guarantee it matches the schema. Decode anyway.

## Structured output

`LanguageModel.generateObject` takes a `Schema` directly and returns the parsed value in `.value`. Reuse the same schema the rest of the app decodes with — a mismatch between the LLM output schema and the domain schema is how the committed cache silently goes stale.

```typescript
const result =
  yield *
  LanguageModel.generateObject({
    objectName: "skillSet",
    prompt,
    schema: SkillSet,
  });
result.value; // Schema.Schema.Type<typeof SkillSet>
```

## Cache contract test

The committed cache in `src/data/cache/` is generated output frozen in git. Keep one test that decodes every cache file against the current schemas — it is the only thing that catches a schema change invalidating the cache.

```typescript
it("committed cache decodes against current schemas", () => {
  for (const file of cacheFiles) {
    expect(Schema.decodeUnknownSync(PassportResult)(file)).toBeDefined();
  }
});
```

## Errors

Decode failures surface as `ParseError`. Wrap them in a domain tagged error at the boundary rather than surfacing `ParseError` to the UI.

```typescript
Schema.decodeUnknown(VisaRequirement)(raw).pipe(
  Effect.mapError(
    (cause) => new VisaDataError({ cause, country, message: "invalid visa fixture" }),
  ),
);
```
