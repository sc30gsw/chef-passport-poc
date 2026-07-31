# 0001 — TanStack Start over Next.js

- **Status:** accepted
- **Date:** 2026-07-30

## Context

`docs/requirement.md` originally named `Next.js + shadcn/ui` as the stack. Meanwhile
`.claude/rules/` had already been written against TanStack Start + Mantine 9 + Tailwind 4 +
Effect 3.22, and those rules encode a set of traps that were already solved:

- Nitro is required to deploy TanStack Start to Vercel; `tanstackStart()` has no `target`.
- `tailwind-preset-mantine` is the single CSS entry point; importing `@mantine/core/styles.css`
  alongside `styles.layer.css` breaks specificity.
- `@mantine/hooks` #9078 pins `useEffectEvent`-based hooks to first render inside
  `forwardRef`/`memo`, which is why modals here need explicit close buttons.
- `@effect/vitest` is unusable against Vite+'s bundled Vitest 4.1.9, so tests use a local
  `itEffect` helper.
- Server functions cannot be imported under Vitest without dropping the `tanstackStart()`
  plugin and mocking the builder.

## Decision

`.claude/rules/` is the single source of truth for the stack. The `requirement.md` stack line
was rewritten to TanStack Start. Next.js is not used.

## Consequences

- The pre-solved traps above stay solved; reverting to Next.js would discard all of them.
- `createServerFn` is the only API layer. No Elysia, no Hono, no REST layer, no react-query.
- vite-plus on Vercel has no public track record, so the deploy is proven first (issue #0)
  rather than last. A documented Next.js retreat stayed open until that spike passed.
- Any library documentation that assumes Next.js (`app/`, route handlers, `next/*`) does not
  apply and must be translated to Start's equivalents.
