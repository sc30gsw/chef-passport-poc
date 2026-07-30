---
description: Core coding style — naming, immutability, file size, lint-backed bans, comment policy
globs: ["**/*.{ts,tsx}"]
alwaysApply: true
---

# Coding Style

Enforcement lives in `vite.config.ts` (`lint` / `fmt`) and `.vite-hooks/pre-commit` (`react-doctor --staged` + `vp staged`). `denyWarnings: true` means a warning fails the build and blocks the commit.

## Immutability

ALWAYS return new values; NEVER mutate in place.

```typescript
// CORRECT
const updated = { ...chef, languageLevel: "conversational" };

// WRONG
chef.languageLevel = "conversational";
```

## File size

- 200–400 lines typical, 600 maximum
- One primary responsibility per file
- **No barrel files** (`index.ts` re-exports) — they defeat rolldown tree-shaking

## Naming

| Target                   | Convention       | Example                            |
| ------------------------ | ---------------- | ---------------------------------- |
| Variables / fn           | lowerCamelCase   | `chefProfile`, `scoreJobMatch`     |
| Components               | UpperCamelCase   | `PassportCard`, `PipelineTimeline` |
| Types                    | UpperCamelCase   | `VisaRequirement`, `PipelineEvent` |
| Effect services / Layers | UpperCamelCase   | `PassportPipeline`, `AnthropicLive` |
| Constants                | UPPER_SNAKE_CASE | `MAX_RESUME_LENGTH`                |
| Files                    | kebab-case       | `visa-eligibility.ts`              |

## Lint-backed bans

- **No `export default`** outside `src/router.tsx` and `*.config.ts` (`no-default-export: "error"`)
- **No relative imports** — use the `~/` alias. Exception: `scripts/**`, which runs under plain Node and cannot resolve tsconfig paths
- **No `interface`** — use `type`
- **No `console.log`** in committed code
- **No import cycles** (`import/no-cycle: "error"`)

## Comments

Comment *why*, not *what*. Two cases in this repo genuinely need one:

1. Values that will drift — currency rates, visa salary thresholds. State the source and capture date.
2. Deliberate deviation from a convention — cite the reason, link the ADR.

```typescript
// Fixed rate captured 2026-07-30. Demo fixture, not a live FX feed.
// See docs/adr/0003-deterministic-scoring.md.
const JPY_PER_SGD = 118.4;
```

## Formatting

`vp fmt` (oxfmt) owns formatting. Do not hand-format. Import order, Tailwind class order (`functions: ["cn"]`), and `package.json` key order are automatic.
