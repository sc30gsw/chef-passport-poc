# Chef Passport PoC — Implementation Plan

> Outcome of the 2026-07-30 grilling session over `docs/requirement.md`.
> `docs/requirement.md` states **what** the PoC is (Japanese, interview-facing).
> This file states **how** it gets built, and supersedes `requirement.md` wherever the two disagree.

## 0. Decision ledger

| #   | Decision                                                                                                                                                                                | Rationale                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `.claude/rules/` is the single source of truth for the stack. `requirement.md`'s `Next.js + shadcn/ui` line was wrong and is now TanStack Start + Mantine 9 + Tailwind 4 + Effect 3.22. | The rules encode already-solved traps (Nitro on Vercel, Mantine hooks #9078, `vite-plus/test`, cache contract test). Reverting to Next.js discards all of it.   |
| D2  | Judgement is deterministic (`src/domain/`); the LLM only produces prose.                                                                                                                | The project's central design claim and the thing the tests prove. "I asked the model to score it" is a weaker story than "scoring is deterministic and tested". |
| D3  | Freeze code 2026-08-09 evening; send the outreach message 2026-08-10.                                                                                                                   | Deliverable and outreach land together.                                                                                                                         |
| D4  | Free-input mode ships behind `ENABLE_FREE_INPUT`, default **off**.                                                                                                                      | Public URL + paid gateway key. The rules require the flag; the demo requires the feature. A scheduled flip satisfies both.                                      |
| D5  | Route through Vercel AI Gateway; `AI_GATEWAY_API_KEY` already matches the name the rules use.                                                                                           | `AI_GATEWAY_BASE_URL` keeps a direct `api.anthropic.com` run possible if the gateway misbehaves.                                                                |
| D6  | Vercel deploy is proven **first** (issue #0), not last.                                                                                                                                 | No public track record of vite-plus on Vercel. A late failure has no escape route.                                                                              |
| D7  | Five phase-level issues, `main` ← PR ← branch. `develop` is abandoned.                                                                                                                  | PR/issue history is part of the deliverable.                                                                                                                    |
| D8  | The persona → grade table is a **test fixture**, i.e. a specification. Visa and job data are designed backwards from it.                                                                | With deterministic scoring, nothing else guarantees the promised outcomes. Asserting them directly is both the safety net and the evidence.                     |
| D9  | Time budget is not a constraint; the 2026-08-09 freeze is the only limit. All test layers are written, TDD-first.                                                                       | User decision. The former cut-priority list becomes a contingency, not a plan.                                                                                  |

## 1. Architecture — the deterministic / LLM boundary

| Step                                            | Implementation                                             |
| ----------------------------------------------- | ---------------------------------------------------------- |
| 1. Extract and structure skills                 | **LLM** — `generateObject` against `SkillSet`              |
| 2. Visa eligibility                             | **Deterministic** + LLM for the explanation sentence only  |
| 3. Translate skills to local kitchen vocabulary | **LLM** — `generateObject`                                 |
| 4. Job matching                                 | **Deterministic score** + LLM for the reason sentence only |

`src/domain/` imports neither Effect nor React at runtime. It is plain functions over plain data —
that constraint is the architecture claim.

## 2. Data model

All schemas are `effect/Schema`; types are derived, never hand-written. Literal unions over
`string` everywhere the domain layer compares values.

### 2.1 Shared vocabulary

`src/data/skill-vocabulary.json` is the single skill-ID list. Persona skills and job
`requiredSkills` both draw from it. String equality across that shared list is the only reason
deterministic scoring works; free-form strings on either side would silently degrade every match
to zero. A contract test asserts the JSON ids equal the `SkillId` union exactly.

```
LanguageLevel = "none" | "basic" | "conversational" | "business"   // ordered
```

### 2.2 Visa requirements — `src/data/visa-requirements.json`

| Country | Visas                                                                     | Constraint type          |
| ------- | ------------------------------------------------------------------------- | ------------------------ |
| SG      | Employment Pass, S Pass                                                   | salary floor + points    |
| AU      | subclass 482 (Skills in Demand), subclass 417 (Working Holiday, age ≤ 30) | sponsorship / age cap    |
| US      | H-2B (seasonal), O-1 (extraordinary ability)                              | lottery / evidence proof |

`sourceUrl` values are **real** government pages (MOM / Department of Home Affairs / USCIS),
verified rather than guessed. Figures are mock but grounded in published values where those exist;
JSON cannot hold comments, so the source and capture date live in `durationNote`, which also puts
the provenance on screen.

### 2.3 Personas — `src/data/personas/`

| Persona   | Age | Genre           | Years | Language       |
| --------- | --- | --------------- | ----- | -------------- |
| 佐藤 匠   | 32  | sushi / kaiseki | 8     | conversational |
| 鈴木 遥   | 28  | french / bistro | 5     | basic          |
| 高橋 健太 | 26  | ramen           | 6     | none           |

Sato is the only persona over 417's age cap, which is what makes the Working-Holiday split fall
out of the data instead of being hardcoded. Each persona ships as raw Japanese résumé prose (the
real pipeline input) plus the structured record the domain layer consumes.

### 2.4 Jobs — `src/data/jobs.json`

15 jobs, 5 per country. Deliberate distribution per country: 4 sponsor-capable, **1 not** (so the
exclusion path always fires); required language spread `business` ×2 / `conversational` ×2 /
`basic` ×1. No real venue names.

## 3. Deterministic rules

### 3.1 Visa eligibility and the ◎○△ grade

Evaluated **per visa**, not per country. Hard constraints **exclude** rather than subtract, and
every violated one is reported with its actual figures:

- `requiresSponsor` and no attainable sponsor-capable job in that country
- age > `maxAgeYears`
- best attainable salary < `minSalary`
- years < `minExperienceYears`
- `requiresEvidenceProof` and no award/media evidence
- `requiresSeasonalRole` and no seasonal job in that country

Soft score for an eligible visa, 0-100: experience 40, language 30, salary attainability 20, genre
demand 10. Salary attainability grades **headroom above the floor**, not pass/fail — grading
pass/fail let a low-floor visa outscore a demanding one.

| Grade | Condition                                    |
| ----- | -------------------------------------------- |
| ◎     | at least one eligible visa with score ≥ 70   |
| ○     | best eligible visa scores 40-69              |
| △     | no eligible visa, or best eligible visa < 40 |

There is no ×; a △ card names the violated constraint.

### 3.2 Job match score — `src/domain/scoring.ts`

100 points: required-skill overlap 40, experience 20, language 20, genre match 10, salary band 10.
Language is soft here, so a language gap shows as a visible note rather than an empty screen.

A job that will not sponsor is only reachable on a visa that needs no sponsor. Without one it is
**excluded with a reason**, not scored to zero — a zero is indistinguishable from a bad fit.

### 3.3 Expected-outcome fixture (D8)

`src/domain/expected-outcomes.test.ts` asserts this table directly.

| Persona   | SG  | AU  | US  | Deciding factor                                                 |
| --------- | --- | --- | --- | --------------------------------------------------------------- |
| 佐藤 匠   | ◎   | ○   | △   | EP salary floor cleared; 417 blocked by age; O-1 needs evidence |
| 鈴木 遥   | ○   | ○   | △   | balanced; 482 sponsorship path                                  |
| 高橋 健太 | △   | ○   | △   | SG salary floors unreachable; 417 only (no sponsor, no floor)   |

Suzuki and Takahashi both reach AU ○ — via different visas. That divergence proves the mechanism
is general rather than a fixed output, and it is asserted directly.

## 4. Pipeline, cache, replay

- Interface: `PassportPipeline` exposing `Stream.Stream<PipelineEvent>`. Two Layers, one
  interface: `PipelineLive` (gateway) and `pipelineFromCache` (committed JSON). The UI never
  branches on which is active.
- The Stream has **no error channel** — failures arrive as a `Failed` event, so everything stays
  serializable across a server-function boundary.
- Models: `anthropic/claude-haiku-4.5` for extraction and translation, `anthropic/claude-sonnet-5`
  for explanation prose.
- Resilience: `Effect.timeout("30 seconds")` + `Effect.retry(exponential ∩ recurs(2))`. Retries
  are ours to write; the gateway documents fallback but not retries.
- `scripts/generate-passport.ts` (`vp run generate:passport`) drives the real live pipeline and
  records each step's measured duration in ms.
- Replay uses those measured durations, clamped to 0.8-2.5 s per step. Real recorded timing, not a
  fake progress bar, so it can be described honestly on stage.
- Cache files are generated artifacts: never hand-edited. Fix the generator, re-run.
- `PassportResult.proseSource` records whether the wording came from the model or the
  deterministic fallback, so the two can never be confused.

## 5. Routes

```
/                      Screen 1 — three persona cards + "自由入力モード"
/passport/$personaId   Screens 2 → 3 — timeline replays, then collapses into the dashboard
/free                  Free input; with the flag off, explains why and links back to /
```

`src/routes/__root.tsx` owns `<html>`, `mantineHtmlProps`, `ColorSchemeScript`,
`MantineProvider`, and the mock-data disclaimer, so the disclaimer cannot be omitted.

## 6. Free input

```
MAX_RESUME_LENGTH = 2000
FreeInputRequest = Schema.Struct({
  resume: Schema.String.pipe(Schema.minLength(50), Schema.maxLength(MAX_RESUME_LENGTH)),
})
```

Three guards, all required: server-side `ENABLE_FREE_INPUT` (default off), length cap **in the
schema** not only the UI, and a per-key spend ceiling in the AI Gateway dashboard. On
live-generation failure, fall back to Sato Takumi's cache with an explicit banner. Silent
substitution is not implemented.

## 7. Testing — layers, TDD (D9)

`vite-plus/test` only; never a direct `vitest` import.

| Layer            | Scope                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| Pure functions   | `src/domain/**` — exhaustive, including §3.3's fixture                               |
| Cache contract   | Decode every `src/data/cache/*.json`, and check grades against a fresh recomputation |
| Effect services  | Pipeline against a stub `LanguageModel` Layer. Never the real API                    |
| Components       | Testing Library, rendered inside `MantineProvider` via `src/testing/render`          |
| Server functions | Hoisted builder mock with `inputValidator` still running the validator               |

`itEffect` in `src/testing/effect.ts` replaces `@effect/vitest`, whose peer is vitest ^3.2.0
against Vite+'s bundled 4.1.9. `tanstackStart()` is dropped from the plugin list under `VITEST`.

Query priority `getByRole` → `getByText` → label/placeholder. `data-testid` is forbidden; add an
`aria-label` instead.

## 8. Documentation deliverables

| File                                          | Language | Issue              |
| --------------------------------------------- | -------- | ------------------ |
| `PLAN.md`                                     | English  | This file          |
| `docs/requirement.md`                         | Japanese | Updated 2026-07-30 |
| `.env.example`                                | —        | Names only         |
| `CONTEXT.md`                                  | English  | #4                 |
| `docs/adr/0001-tanstack-start-over-nextjs.md` | English  | #0 — D1            |
| `docs/adr/0002-ai-gateway-routing.md`         | English  | #0 — D5            |
| `docs/adr/0003-deterministic-scoring.md`      | English  | #0 — D2            |
| `docs/demo-script.md`                         | Japanese | #4                 |
| `README.md`                                   | English  | #4                 |

UI copy is Japanese; only the translated-skills section renders English. Code, comments, commits
and PR bodies are English.

## 9. Issues

- **#0 `chore: deploy spike and ADRs`** — Nitro plugin, `vercel.json`, dependency pass, Mantine
  SSR wiring, disclaimer banner, ADRs 0001-0003. Done when a Vercel URL renders a Mantine page.
- **#1 `feat: domain and data`** — schemas, the four data files, the two deterministic modules,
  §3.3 fixture. Done when the outcome table passes.
- **#2 `feat: ai pipeline and cache`** — client layer, four steps, `PipelineEvent`, both Layers,
  `src/lib/runtime.ts`, generator, contract test.
- **#3 `feat: three screens`** — the three routes, timeline, dashboard, component tests.
- **#4 `feat: free input and release`** — `/free` form, gate, fallback banner, `CONTEXT.md`,
  `README.md`, `docs/demo-script.md`, `fallow`, `doctor`, production smoke test, rehearsal.

## 10. Environment variables

| Name                  | Notes                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`  | Server-only. **Never** a `VITE_` prefix; read inside the handler, never at module scope |
| `AI_GATEWAY_BASE_URL` | Defaults to `https://ai-gateway.vercel.sh` (no trailing `/v1`)                          |
| `ENABLE_FREE_INPUT`   | `false` by default; `true` only for the interview window (D4)                           |

Model slugs must be provider-prefixed — a bare `claude-sonnet-5` returns 404. No Claude model is
free-tier eligible.

## 11. Definition of Done

- [ ] Three presets × three screens run without breaking
- [ ] Deployed to Vercel, URL shareable
- [ ] Free-input mode generates live (fallback verified by forcing a failure)
- [ ] Mock-data disclaimer on every screen, every visa card links its source URL
- [ ] Public GitHub repo; README carries design intent and the pipeline diagram
- [ ] Backup demo video recorded
- [ ] Talk script ready
- [ ] `vp check`, `vp test`, `vp build` all green; domain coverage exhaustive; cache contract test passing
- [ ] Five issues closed via five merged PRs, `main` never pushed directly

## 12. Risks

| Risk                                          | Mitigation                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| vite-plus on Vercel is unproven               | #0 proves it first; a documented Next.js retreat stays open             |
| Live API fails on stage                       | Fixed preset fallback + banner + backup video                           |
| Fixture cannot be satisfied by plausible data | Figures are tunable, the outcome table is not                           |
| Cache goes stale against a schema change      | Contract test; cache is regenerated, never hand-edited                  |
| Visa figures called out as inaccurate         | Disclaimer + real source links + "structuring is the point" framing     |
| Mantine hooks #9078 breaks a control live     | Explicit buttons; no reliance on click-outside or `use-collapse`        |
| Gateway spend                                 | Server-side flag off by default + schema length cap + dashboard ceiling |

## 13. Out of scope

Employer-side experience; a fourth country; real restaurants or real listings; login, DB, or
listing management; any guarantee of legal accuracy.
