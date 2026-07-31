# 0004 — The SSoT traceability ledger is per schema, not per export

- **Status:** accepted
- **Date:** 2026-07-31

## Context

The map issue asked to "follow SSoT — add every type and code to traceability". Read literally that
is a row per exported symbol: roughly 60 today, and growing with every commit. `docs/agents/domain.md`
already specifies this repo's domain-doc setup as "one `CONTEXT.md` plus `docs/adr/` at the repo
root", and `CONTEXT.md` did not exist, so the ledger also had to be that file's first content.

The technical half of SSoT was already in place: `src/data/schemas.ts` defines each schema with its
derived type immediately below it, and `.claude/rules/typescript/effect-schema.md` makes that the
rule. What was missing was the readable mapping — where a term comes from, who decides it, who
renders it, what proves it.

A 60-row ledger fails in a specific way. Every new export needs a manual edit; the ones made under
time pressure are content-free; and a "derived type" column would repeat the schema column verbatim,
because the type and the schema share a name by construction. A ledger nobody updates is worse than
no ledger, and a table that is 40% empty teaches the wrong thing.

## Decision

`CONTEXT.md` at the repo root holds three sections: `## Language` (prose term definitions, English
headwords matching the schema export name with the Japanese UI wording beside them), `## Traceability`
(the table), and `## Deterministic / LLM boundary`.

The table carries **one row per exported schema** — the 21 in `src/data/schemas.ts` plus the
feature-level request and event schemas — with the columns `term | schema | decided by | rendered by
| proven by`. Structural schemas get `—` in **decided by**; that is information, not a gap. References
are symbol names and file paths, never `file:line`, which rots on the next edit.

Two tests in `src/data/context-ledger.test.ts` keep it honest: every `export const X = Schema.…` in
`src/data/schemas.ts` must appear in `CONTEXT.md`, and so must every exported function in
`src/domain/`. Both match anywhere in the file rather than in a particular column — three domain
functions are numeric or display helpers that decide nothing, so a column-scoped assertion would be
unsatisfiable without lying about them.

## Consequences

- Adding a schema without a ledger entry fails the build, the same way `src/data/cache-contract.test.ts`
  fails when a schema change invalidates the committed cache.
- Adding a plain exported symbol — a constant, a component, a hook — does **not** require a ledger
  edit. That is the granularity being bought, and the cost is that the ledger is not an index of the
  codebase. It is an index of the domain.
- The boundary section is the part a reviewer actually needs: it names the four LLM steps, states
  that none of them may decide anything but prose, and points at the deterministic counterparts in
  `src/domain/`. See [0003](./0003-deterministic-scoring.md).
- Coverage thresholds stay out of scope. `@vitest/coverage-v8` is installed and `vite.config.ts`
  declares no `coverage.thresholds`; the ledger is guarded by two targeted tests, not by a global
  number.
