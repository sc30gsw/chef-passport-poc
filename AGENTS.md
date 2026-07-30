# Using Vite+ (`vp`)

**Vite+** is one CLI for dev, build, tests, lint, format, and package management—it wraps Vite and related bundled tooling. `vp dev` and `vp build` invoke Vite. Explore with `vp help`, `vp <command> --help`, and `vp --version`.

**Common commands:** `vp install`, `vp dev`, `vp check`, `vp lint`, `vp test`, `vp build`, `vp run <script>`, `vp add` / `vp remove` / `vp update`.

**Workflow:** After pulling, run `vp install` when dependencies or lockfiles may have changed. Before calling work done, run `vp check` and `vp test`.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ commands take precedence over `package.json` scripts. If there is a `test` script defined in `scripts` that conflicts with the built-in `vp test` command, run it using `vp run test`.
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## Supplementary project tools

Not part of `vp check`. Use `vp run` so installs stay routed through Vite+.

- **Fallow** (`vp run fallow`) — unused files, dependencies, and exports. Use when trimming deps or refactoring entry points (`.fallowrc.json` configures the project).
- **react-doctor** (`vp run doctor`) — React-focused health checks. The script uses `--no-lint`; keep ordinary linting on `vp lint`.

## Project rules

Stack-specific conventions live in `.claude/rules/`. Read the ones matching the files you are touching.

| Rule | Covers |
| --- | --- |
| `common/coding-style.md` | Naming, immutability, file size, lint-backed bans, comment policy |
| `common/development-workflow.md` | `vp` commands, forbidden alternatives, `minimumReleaseAge`, PR pre-check |
| `common/security.md` | `.env*` handling, server-only env vars, input validation, public-demo abuse guard |
| `common/testing.md` | TDD via `vite-plus/test`, Effect helper, jsdom + Testing Library, server-fn mock, pinned coverage provider |
| `typescript/project-structure.md` | bulletproof-react layout, `~/` alias, unidirectional imports, `domain/` + `data/` layers |
| `typescript/react-conventions.md` | Named exports, function declarations, Utility-type props, react-compiler |
| `typescript/effect-patterns.md` | Effect 3.22 tagged errors, Service/Layer boundaries, retry/fallback, serialization boundary |
| `typescript/effect-schema.md` | `effect/Schema` as the only validator, decode boundaries, cache contract test |
| `web/mantine-tailwind.md` | Mantine 9 + `tailwind-preset-mantine`, CSS layer rules, `@mantine/hooks` hazards |
| `web/tanstack-start.md` | Server functions, streaming, Vercel deploy via Nitro, Node-side scripts |
| `web/ai-pipeline.md` | The deterministic/LLM boundary, `@effect/ai` usage, AI Gateway routing, committed cache |

## Current implementation state

This repo is currently a bare Vite+/TanStack Start scaffold — `src/domain/`, `src/data/`, `src/features/`, and `src/lib/` don't exist yet, and `package.json` has none of `@mantine/core`, `effect`, or `@effect/ai`. `.claude/rules/` and `docs/requirement.md` describe the **target architecture** for the Chef Passport PoC, not code that already exists. Add the dependency before importing from it.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`sc30gsw/chef-passport-poc`), managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Product spec

PoC scope, the three demo personas, the three-screen demo flow, and the 25-hour/2-week time budget are defined in `docs/requirement.md` (Japanese). Read it before implementing new features or components.
