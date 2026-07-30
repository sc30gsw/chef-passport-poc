---
description: TDD with vite-plus/test — Effect helper, jsdom + Testing Library, server-fn mock, pinned coverage provider
globs: ["**/*.{test,spec}.{ts,tsx}", "src/testing/**/*.ts"]
alwaysApply: true
---

# Testing

Test-first is the default. Write the failing test, then the implementation.

## Import from `vite-plus/test`

```typescript
// CORRECT
import { expect, it, vi } from "vite-plus/test";

// WRONG: direct vitest import
import { expect, it } from "vitest";
```

Run with `vp test`. Never `vp run vitest` or `vp vitest`.

## Never install `@effect/vitest`

Its peer is `vitest ^3.2.0`; Vite+ 0.2.1 bundles **4.1.9**, and `vitest` is not resolvable from the project root. Installing it also violates the no-direct-vitest rule. Use a local helper:

```typescript
// src/testing/effect.ts
import { Effect } from "effect";
import { it } from "vite-plus/test";

export function itEffect(name: string, self: Effect.Effect<unknown, unknown, never>) {
  it(name, () => Effect.runPromise(self as Effect.Effect<unknown>));
}
```

## Four test layers

| Layer            | Target                           | Notes                                                                           |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| Pure functions   | `src/domain/**`                  | No harness. Highest value — this is what makes deterministic scoring defensible |
| Effect services  | `src/features/*/api/**`          | Provide a stub `LanguageModel` Layer; never call the real API                   |
| Components       | `src/features/*/components/**`   | jsdom + Testing Library                                                         |
| Server functions | `src/features/*/api/*-server.ts` | See the mock pattern below                                                      |

Pure-function coverage is non-negotiable: the project claims visa eligibility and job scoring are deterministic, and tests are the evidence.

## Effect service tests use a stub Layer

```typescript
// CORRECT: swap the model, keep the pipeline
const StubModel = Layer.succeed(LanguageModel.LanguageModel, stubResponses);
itEffect("extracts skills", pipeline.pipe(Effect.provide(StubModel)));

// WRONG: hitting the real API in a test
itEffect("extracts skills", pipeline.pipe(Effect.provide(AnthropicLive)));
```

## DOM environment

`jsdom` is not bundled — install `jsdom@30.0.1` (not a forbidden package). Set `test.environment` and `test.setupFiles` in `vite.config.ts`, or opt in per file with a docblock:

```typescript
// @vitest-environment jsdom
```

Installed set: `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1` (required peer), `@testing-library/user-event@14.6.1`, `@testing-library/jest-dom@7.0.0`. Vite+ lists `@testing-library/jest-dom` in its `AUTO_INLINE_DEPS`, so its matchers work without extra config once installed.

Components must render inside `MantineProvider` — use a shared helper in `src/testing/`, not Testing Library's bare `render`.

## Query priority

1. `getByRole` — most accessible
2. `getByText`
3. `getByLabelText` / `getByPlaceholderText`
4. `getByAltText`

```typescript
// CORRECT
const button = getByRole("button", { name: "この経歴で判定する" });

// WRONG
const button = getByTestId("submit-button");
```

**`data-testid` is forbidden.** Add an `aria-label` instead.

Mantine caveats: a `required` field's label text includes a trailing `*`, so match with a regex. Popover-based components (`Menu`, `Select`, `Modal`) cannot measure layout in jsdom and stay `display: none` — pass `{ hidden: true }` to reach their items.

## Server function tests

Server functions cannot be imported normally: the `'use server'` invariant throws, and the `tanstackStart()` Vite plugin rewrites `handler(fn)` into a client RPC stub at build time. Two things are required.

1. `vite.config.ts` — drop the plugin under Vitest:

```typescript
const isVitest = process.env.VITEST === "true";

plugins: [tailwindcss(), ...(isVitest ? [] : [tanstackStart()]), react(), babel({ ... })],
```

2. `src/testing/server-fn-mock.ts` — a hoisted builder mock, imported for its side effect from `src/testing/setup.ts`. Keep `inputValidator` **running the validator** so schema-failure tests still exercise it:

```typescript
inputValidator(validate) {
  return { handler: (fn) => (opts) => fn({ data: validate(opts.data) }) };
}
```

Not covered: middleware execution, `Response`/`Headers`/status assertions, nested server-fn calls. Test the handler payload directly. Full write-up: the `tanstack-start-server-fn-testing` skill.

Prefer keeping handler bodies as plain exported functions and testing those — the `createServerFn` wrapper then needs no coverage.

## Coverage

```bash
vp add -D @vitest/coverage-v8@4.1.9
```

**Exact version only.** `latest` (4.1.10) declares `vitest: 4.1.10` as its peer, and Vite+'s `assertCoverageProviderVersionMatch` throws on any skew rather than warning.
