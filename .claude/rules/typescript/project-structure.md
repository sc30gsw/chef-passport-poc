---
description: Bulletproof React features/* layout, ~ alias, unidirectional imports, domain/data shared layers
globs: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"]
alwaysApply: true
---

# Project Structure

Follows [bulletproof-react](https://github.com/alan2207/bulletproof-react), adapted for TanStack Start and Effect.

## Layout

```
scripts/
└── generate-passport.ts     # cache generator, runs under plain Node (outside src/)
src/
├── routes/                  # ← bulletproof-react's src/app. Thin adapters only
│   ├── __root.tsx           # MantineProvider + ColorSchemeScript + demo disclaimer
│   └── ...
├── domain/                  # pure functions + types. NO Effect, NO AI, NO React
│   ├── scoring.ts           # deterministic job-match score
│   └── visa-eligibility.ts  # deterministic visa eligibility
├── data/                    # static JSON + decoders
│   ├── visa-requirements.json
│   ├── jobs.json
│   ├── personas/            # raw Japanese resume text per persona
│   └── cache/               # pre-generated pipeline output (committed)
├── features/<feature>/
│   ├── api/                 # feature-scoped Effect services + Layers (see note)
│   ├── components/
│   ├── hooks/
│   ├── types/
│   └── utils/
├── components/              # shared UI, created on demand
├── config/
├── lib/                     # runtime.ts (single Layer composition point), ai-client.ts
├── testing/                 # setup.ts, server-fn-mock.ts, render helpers
└── types/
```

There is no `src/utils/`: its only occupant was `cn.ts`, deleted with the `cnfast` dependency by
closed decision **#12**. Recreate the directory when a shared utility actually exists.


`src/domain/` and `src/data/` are additions to bulletproof-react. They sit at the shared bottom because `scripts/` and `features/` both consume them, and because keeping `domain/` free of AI dependencies is the architectural claim this project makes.

`features/*/api/` is **redefined**: bulletproof-react puts react-query hooks there; this project puts Effect services and Layers there. There is no react-query, no axios, no `lib/api-client.ts`.

Layers cannot live inside a feature — `src/lib/runtime.ts` is the single composition point and sits above `features/`.

## `~` alias (relative paths forbidden)

`tsconfig.json` sets `baseUrl` + `paths: { "~/*": ["src/*"] }`; `vite.config.ts` mirrors it in `resolve.alias`.

```typescript
// CORRECT
import { scoreJobMatch } from "~/domain/scoring";
import type { PipelineEvent } from "~/features/passport/types/pipeline-event";

// WRONG: relative paths — forbidden even within the same directory
import { scoreJobMatch } from "../domain/scoring";
import { helper } from "./helper";
```

**Exception: `scripts/`.** It runs under plain Node, which does not resolve tsconfig paths and **requires explicit file extensions**.

```typescript
// scripts/generate-passport.ts — CORRECT
import { scoreJobMatch } from "../src/domain/scoring.ts";
```

## Unidirectional imports

Flow is `shared → features → routes`. oxlint has **no `import/no-restricted-paths`** (the rule does not exist in oxc), so this is approximated with `no-restricted-imports` patterns in `vite.config.ts` `lint.overrides`, plus `import/no-cycle` and the `~/`-only rule that makes relative escapes visible.

```typescript
// WRONG: feature importing from another feature
import { PassportCard } from "~/features/other/components/passport-card";

// WRONG: shared layer importing from a feature (in src/domain/scoring.ts)
import type { PipelineEvent } from "~/features/passport/types/pipeline-event";

// WRONG: feature importing from routes
import { Route } from "~/routes/passport";

// CORRECT: promote the shared thing upward
import { PassportCard } from "~/components/passport-card";
```

## Routes are thin

Route files use `export const Route = createFileRoute(...)` (named export — no `no-default-export` override needed). They compose feature components and hold no business logic.

## No barrel files

`index.ts` re-export files are forbidden — they defeat rolldown tree-shaking. Import the concrete module path.
