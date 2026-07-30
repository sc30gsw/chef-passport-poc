---
description: Named exports, function declarations, Utility-type props, as const satisfies, react-compiler, inference
globs: ["src/**/*.tsx", "src/**/hooks/*.ts"]
alwaysApply: true
---

# React Conventions

## Named exports only

```typescript
// CORRECT
export function PassportCard({ country }: Pick<CountryResult, "country">) { ... }

// WRONG: default export (only src/router.tsx and *.config.ts are exempt)
export default function PassportCard() { ... }
```

## Function declarations (not arrow functions)

Components and custom hooks use `function` declaration syntax.

```typescript
// CORRECT
export function PipelineTimeline({ events }: Pick<PipelineState, "events">) {
  return <ol>{...}</ol>;
}

export function usePipelineStream({ personaId }: Record<"personaId", string>) { ... }

// WRONG
export const PipelineTimeline = ({ events }: Props) => <ol>{...}</ol>;
```

## Utility-type props

- **1–2 props**: no dedicated type — use `Pick`, `Omit`, or `Record` inline
- **3+ props**: a named `type` next to the component

```typescript
// CORRECT: 1 prop → inline Record
export function Container({ children }: Record<"children", ReactNode>) { ... }

// CORRECT: derived from an existing domain type
export function VisaName({ name }: Pick<VisaRequirement, "name">) { ... }

// CORRECT: 3+ props → named type
type JobMatchRowProps = {
  excludedReason?: string;
  job: Job;
  score: number;
};
export function JobMatchRow({ job, score, excludedReason }: JobMatchRowProps) { ... }
```

## `as const satisfies` for constants

```typescript
// CORRECT: literal types preserved and type-checked
const LANGUAGE_LABELS = {
  basic: "簡単な英会話",
  business: "ビジネスレベル",
  conversational: "日常会話レベル",
  none: "ほぼ不可",
} as const satisfies Record<LanguageLevel, string>;

// WRONG: widened to string
const LANGUAGE_LABELS: Record<LanguageLevel, string> = { ... };
```

## react-compiler

The React Compiler babel plugin is enabled. Do **not** add manual memoization without a profiler measurement.

```typescript
// WRONG: unnecessary — the compiler handles this
const total = useMemo(() => sumScores(jobs), [jobs]);
const onPick = useCallback(() => pick(id), [id]);

// CORRECT
const total = sumScores(jobs);
```

Known interaction: some `@mantine/hooks` hooks misbehave inside `forwardRef`/`memo`. See [../web/mantine-tailwind.md](../web/mantine-tailwind.md).

## Prefer type inference

Annotate only when inference yields `unknown`/`any`, or at an explicit public API boundary.

```typescript
// WRONG: redundant annotation
export const fetchJobsServer = createServerFn().handler(async (): Promise<Job[]> => jobs);

// CORRECT
export const fetchJobsServer = createServerFn().handler(async () => jobs);
```

## Accessibility

`jsx-a11y` runs with `denyWarnings: true`, so a11y violations fail the build. Interactive elements need accessible names. `data-testid` is forbidden — add an `aria-label` when an element has no role or text.

## Related

- `react-doctor` skill / `vp run doctor` — React health checks
- `react-stinky` skill — maintainability smells
