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

- **Fallow** (`vp run fallow`) — unused files, dependencies, and exports. Use when trimming deps or refactoring entry points (`.fallowrc.jsonc` configures the project).
- **react-doctor** (`vp run doctor`) — React-focused health checks. The script uses `--no-lint`; keep ordinary linting on `vp lint`.

**Both are gated in CI and both are currently at zero.** `ci.yml` runs `vp run fallow` as a
blocking step; `react-doctor.yml` runs the action with `blocking: warning` + `scope: full`, pinned
to the same version as `package.json`. Findings this project does not own — build output, vendored
tool directories — are excluded in `doctor.config.ts` and `.fallowrc.jsonc`, each with a comment
naming the reason. Note the action scans **with** lint while `vp run doctor` passes `--no-lint`, so
a clean local `vp run doctor` is necessary but not sufficient; `vp exec react-doctor . --yes` is the
run that matches CI. See #20.

## Project rules

Stack-specific conventions live in `.claude/rules/`. Read the ones matching the files you are touching.

| Rule                              | Covers                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `common/coding-style.md`          | Naming, immutability, file size, lint-backed bans, comment policy                                          |
| `common/development-workflow.md`  | `vp` commands, forbidden alternatives, `minimumReleaseAge`, PR pre-check                                   |
| `common/security.md`              | `.env*` handling, server-only env vars, input validation, public-demo abuse guard                          |
| `common/testing.md`               | TDD via `vite-plus/test`, Effect helper, jsdom + Testing Library, server-fn mock, pinned coverage provider |
| `typescript/project-structure.md` | bulletproof-react layout, `~/` alias, unidirectional imports, `domain/` + `data/` layers                   |
| `typescript/react-conventions.md` | Named exports, function declarations, Utility-type props, react-compiler                                   |
| `typescript/effect-patterns.md`   | Effect 3.22 tagged errors, Service/Layer boundaries, retry/fallback, serialization boundary                |
| `typescript/effect-schema.md`     | `effect/Schema` as the only validator, decode boundaries, cache contract test                              |
| `web/mantine-tailwind.md`         | Mantine 9 + `tailwind-preset-mantine`, CSS layer rules, `@mantine/hooks` hazards                           |
| `web/tanstack-start.md`           | Server functions, streaming, Vercel deploy via Nitro, Node-side scripts                                    |
| `web/ai-pipeline.md`              | The deterministic/LLM boundary, `@effect/ai` usage, AI Gateway routing, committed cache                    |

## Current implementation state

The bulletproof-react layout from `typescript/project-structure.md` is in place — `src/domain/`, `src/data/`, `src/features/`, and `src/lib/` all exist and are populated — and `package.json` pins `@mantine/core`, `effect`, `@effect/ai`, and `@effect/ai-anthropic`. `.claude/rules/` and `docs/requirement.md` describe the architecture this code already follows, not a future target. A test suite exists and `vp test` is green.

This section intentionally does not enumerate what's built or what's left — that goes stale the moment another issue lands. For current status, in-flight work, and what's still missing, check the issue tracker (map issue #2) rather than this file.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`sc30gsw/chef-passport-poc`), managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Product spec

PoC scope, the three demo personas, and the three-screen demo flow are defined in `docs/requirement.md` (Japanese) — that file covers **what** to build. `PLAN.md` (English, repo root) covers **how**: the deterministic/LLM boundary, data schemas, grade and score rules, routes, test layers, env vars, and the five-issue breakdown. Read both before implementing new features or components; where they disagree, `PLAN.md` and `.claude/rules/` win.

The 25-hour budget in earlier drafts is lifted — the only deadline is a 2026-08-09 code freeze.
