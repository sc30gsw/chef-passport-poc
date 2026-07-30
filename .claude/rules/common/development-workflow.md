---
description: Vite+ (vp) command conventions, forbidden alternatives, install constraints, PR pre-check
globs: []
alwaysApply: false
---

# Development Workflow

## Commands

All development operations go through **`vp`** (Vite+). Never call `pnpm`, `npm`, or `yarn` directly.

| Command                    | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `vp dev`                   | Dev server                                      |
| `vp build`                 | Production build                                |
| `vp check`                 | Format + lint + typecheck (`--fix` to auto-fix) |
| `vp check --no-lint`       | Typecheck only                                  |
| `vp test`                  | Run tests (bundled Vitest 4.1.9)                |
| `vp lint`                  | Lint only (oxlint)                              |
| `vp add <pkg>`             | Add a dependency                                |
| `vp run fallow`            | Unused files / exports / dependencies           |
| `vp run doctor`            | React health checks                             |
| `vp run generate:passport` | Regenerate the pre-generated pipeline cache     |
| `vp dlx <pkg>`             | One-off binary (instead of `npx` / `pnpm dlx`)  |

## Forbidden

```
// WRONG: direct package manager calls
pnpm install
npm run build

// WRONG: vp subcommands that do not exist
vp vitest
vp oxlint
vp node

// WRONG: importing from vite or vitest directly
import { defineConfig } from 'vite'
import { expect } from 'vitest'

// CORRECT
import { defineConfig } from 'vite-plus'
import { expect } from 'vite-plus/test'
```

Never install `vitest`, `oxlint`, `oxfmt`, or `tsdown` — Vite+ wraps them. `jsdom` and `@testing-library/*` are NOT in that list and are fine to install.

## Install constraints

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` — **packages published less than 24 hours ago cannot be installed.** If `vp add` fails on a brand-new release, pin the previous version instead of disabling the guard.

`trustPolicy` / `trustPolicyExclude` / `allowBuilds` are pnpm 11 features: honored locally, **ignored on Vercel** (pnpm 9/10). See [../web/tanstack-start.md](../web/tanstack-start.md).

Node must be **>= 24.17.0** (`engines`, `.node-version`).

## Pre-commit

`.vite-hooks/pre-commit` runs `react-doctor --staged --blocking warning`, then `vp staged`. Expect rejections until lint is clean.

## PR pre-check

```bash
vp check          # format + lint + typecheck
vp test           # all unit tests
vp run fallow     # when removing or renaming exports
vp build          # confirms production build succeeds
```

Work on a feature branch and open a PR; never push to `main`. This repository is public — PR and issue history is part of the deliverable. Follow the triage labels in `docs/agents/triage-labels.md` and the issue conventions in `docs/agents/issue-tracker.md`.
