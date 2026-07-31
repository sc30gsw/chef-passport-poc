# Chef Passport

A demo that reads a Japanese chef's résumé and answers three questions: which country they could
work in, on which visa, and in which kitchen. The answers are decided by pure functions in
`src/domain/`; a language model only writes the sentences that describe them. This file is the
ledger that lets a reader confirm that claim without reading the whole codebase — where each domain
term is defined, what decides it, what renders it, and what proves it.

Everything here is **mock data for a demonstration**, not immigration advice. Visa figures and job
listings are fixtures; every visa card links its source URL.

Decisions with their own write-ups: [ADR 0001](docs/adr/0001-tanstack-start-over-nextjs.md)
(TanStack Start over Next.js), [ADR 0002](docs/adr/0002-ai-gateway-routing.md) (AI Gateway routing),
[ADR 0003](docs/adr/0003-deterministic-scoring.md) (judgement is deterministic, wording is
generated), [ADR 0004](docs/adr/0004-ssot-traceability-ledger.md) (this ledger's format).

## Language

Headwords are English and match the schema export name, so the ledger below stays 1:1 with
`src/data/schemas.ts`. The Japanese in parentheses is the wording the UI actually uses — the screens
are entirely Japanese and the code is saturated with `*Ja` suffixes.

### Who is assessed

**Persona** (シェフ / プリセットのシェフ)
A chef the judgement runs on: age, experience, language level, genre, skills, and the raw résumé.
The three preset personas are committed JSON; a free-input run assembles one instead.
_Avoid_: user, candidate, profile.

**Free input** (自由入力モード)
A run driven by a résumé a visitor typed, rather than by a committed persona. It is the only path
that reaches a paid API on a visitor's behalf, so every guard on it refuses rather than degrades.
_Avoid_: custom mode, manual mode.

**Judgement input** (判定に使う値)
A field that changes a deterministic outcome — age, experience years, language level, evidence of
excellence, skills. A model may never invent one: fields a résumé does not reliably state are
declared by the form instead of extracted. Anything else is prose, and nothing judges prose.

**Skill vocabulary** (スキル語彙)
The one closed list of skill ids that personas and jobs are both written against. Deterministic
skill overlap is string equality over this list, which is why extraction is constrained to it.

### What is decided

**Skill set** (スキル抽出結果)
Step 1's structured reading of a résumé — skills, experience years, language level, genre, and a
summary sentence. It is the widest surface a stranger's text has on the app, so every field is
bounded at the schema.

**Visa assessment** (ビザ判定)
One visa's verdict for one persona: eligible or not, a 0–100 fit score, and every blocked reason.
All the reasons, not the first — a chef can miss a visa on two counts and both are shown.

**Grade** (適合度 ◎ / ○ / △)
How attainable a country is, reduced from its best eligible visa. Three levels, not four: a △ that
names the constraint it violated carries the story better than an × that says only "no".

**Job match score** (求人マッチスコア, 0–100)
How well a persona fits one job, from skills (40), experience (20), language (20), genre (10) and
salary (10). A number, never a model's opinion.
_Avoid_: ranking, rating, fit.

**Exclusion** (対象外 / 除外求人)
A job a **hard constraint removes entirely** rather than scores down, with the reason attached. A
job that will not sponsor is unreachable without a sponsor-free visa, and scoring that to zero
would be indistinguishable from a bad fit. The rendered reason is the visible proof the
deterministic logic exists.
_Avoid_: filtered out, rejected, zero-scored.

**Prose source** (説明文の出所)
Whether the wording in a result came from the model or from the deterministic fallback. Recorded on
the result itself so fallback text can never be passed off as model output.

### How a run happens

**Pipeline event** (AI処理の進行状況)
One step starting, one step finishing, or the run ending — the units the progress screen consumes.
Failures travel as an event too, never as a thrown error, because the stream crosses a server-
function boundary and must stay serializable.

**Cache replay** (事前生成キャッシュの再生)
Replaying a preset persona's committed result, paced by the durations the generator actually
measured. No key, no network, reproducible.

**Live generation** (ライブ生成)
Running the same pipeline against the gateway. Cache replay and live generation resolve the **same**
tag and emit the same event type, so no component knows which one is driving it.

**Degradation** (降格)
A run that did not do what the caller asked, said out loud: a live preset that fell back to its
cache, or a free-input run whose wording step failed and fell back to deterministic prose. Absent
means the run did what was asked, which is the only silent case.
_Avoid_: fallback (that names the mechanism, not the report).

## Traceability

One row per exported schema — the SSoT surface, per
`.claude/rules/typescript/effect-schema.md` — plus the feature-level request and event schemas.
There is no separate "derived type" column because there is nothing to say in it: every schema is
immediately followed by `export type X = Schema.Schema.Type<typeof X>`, so the type's name is the
schema's name. Symbol names and file paths only; `file:line` rots on the next edit.

`—` in **decided by** is information, not a gap: it says the type carries data but decides nothing.

| term                                  | schema                  | decided by                                                              | rendered by                                  | proven by                                                                                                           |
| ------------------------------------- | ----------------------- | ----------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Country (対象国)                      | `Country`               | — (`DEMO_COUNTRIES` fixes the demo's three)                             | `CountryGradeCard` via `COUNTRY_LABELS_JA`   | `src/data/schemas.test.ts`                                                                                          |
| Language level (語学レベル)           | `LanguageLevel`         | `languageRank` orders it; the form declares it, extraction never does   | `PersonaCard`, `PassportDashboard`           | `src/data/schemas.test.ts`, `src/domain/scoring.test.ts`                                                            |
| Venue type (業態・ジャンル)           | `VenueType`             | —                                                                       | `PersonaCard` via `GENRE_LABELS_JA`          | `src/data/schemas.test.ts`                                                                                          |
| Skill id (スキル語彙ID)               | `SkillId`               | —                                                                       | `TranslatedSkills`                           | `src/data/schemas.test.ts`                                                                                          |
| Skill vocabulary (スキル語彙)         | `SkillVocabularyEntry`  | —                                                                       | `TranslatedSkills`                           | `src/data/schemas.test.ts`, `src/data/loaders.test.ts`                                                              |
| Money (給与)                          | `Money`                 | — (`toMonthlyAmount` normalises it before any comparison)               | `JobMatchList`                               | `src/data/schemas.test.ts`                                                                                          |
| Visa requirement (ビザ要件)           | `VisaRequirement`       | — (the fixture the judgement reads)                                     | `CountryGradeCard`, incl. its source URL     | `src/data/schemas.test.ts`, `src/data/loaders.test.ts`                                                              |
| Job (求人)                            | `Job`                   | — (`isAttainableJob` decides reachability, not the job)                 | `JobMatchList`                               | `src/data/schemas.test.ts`, `src/domain/visa-eligibility.test.ts`                                                   |
| Persona (シェフ)                      | `Persona`               | `personaFromFreeInput` for free input; committed JSON for presets       | `PersonaCard`, `PassportDashboard`           | `src/data/loaders.test.ts`, `src/features/passport/api/pipeline-service.test.ts`                                    |
| Skill set (スキル抽出結果)            | `SkillSet`              | — LLM step 1, bounded by this schema                                    | `PassportDashboard`                          | `src/data/schemas.test.ts`, `src/features/passport/api/pipeline-service.test.ts`                                    |
| Translated skill (現地語翻訳)         | `TranslatedSkill`       | — LLM step 3                                                            | `TranslatedSkills`                           | `src/data/schemas.test.ts`                                                                                          |
| Grade (適合度 ◎/○/△)                  | `Grade`                 | `gradeFromScore`                                                        | `CountryGradeCard`                           | `src/domain/visa-eligibility.test.ts`, `src/domain/expected-outcomes.test.ts`                                       |
| Visa assessment (ビザ判定)            | `VisaAssessment`        | `assessVisa`                                                            | `CountryGradeCard` (blocked reasons in full) | `src/domain/visa-eligibility.test.ts`                                                                               |
| Country assessment (国別判定)         | `CountryAssessment`     | `assessCountry`, `assessAllCountries`                                   | `CountryGradeCard`                           | `src/domain/visa-eligibility.test.ts`, `src/domain/expected-outcomes.test.ts`                                       |
| Job match (求人マッチ)                | `JobMatch`              | `scoreJobMatch`                                                         | `JobMatchList`                               | `src/domain/scoring.test.ts`                                                                                        |
| Exclusion (除外求人)                  | `ExcludedJob`           | `rankJobMatches`                                                        | `JobMatchList`, behind the 除外 disclosure   | `src/domain/scoring.test.ts`, `src/features/passport/components/job-match-list.test.tsx`                            |
| Pipeline step (処理ステップ)          | `PipelineStep`          | —                                                                       | `PipelineTimeline` via `STEP_LABELS_JA`      | `src/data/schemas.test.ts`, `src/features/passport/components/pipeline-timeline.test.tsx`                           |
| Step timing (実測所要時間)            | `StepTiming`            | — (measured, not invented)                                              | `PipelineTimeline`                           | `src/data/cache-contract.test.ts`, `src/features/passport/utils/replay-pacing.test.ts`                              |
| Country result (国別判定＋説明文)     | `CountryResult`         | `assessCountry`; `explainCountry` adds the sentence only                | `CountryGradeCard`                           | `src/data/schemas.test.ts`, `src/data/cache-contract.test.ts`                                                       |
| Ranked job match (求人マッチ＋理由文) | `RankedJobMatch`        | `scoreJobMatch` / `rankJobMatches`; `explainJobMatch` adds the sentence | `JobMatchList`                               | `src/data/schemas.test.ts`, `src/data/cache-contract.test.ts`                                                       |
| Passport result (判定結果一式)        | `PassportResult`        | `assessDeterministically`, or `deterministicProse` when wording fails   | `PassportDashboard` via `joinPassportView`   | `src/data/cache-contract.test.ts`, `src/features/passport/api/pipeline-service.test.ts`                             |
| Pipeline event (進行イベント)         | `PipelineEvent`         | `derivePipelineRunState` folds a run's events into screen state         | `PipelineTimeline`                           | `src/features/passport/utils/pipeline-run-state.test.ts`, `src/features/passport/api/generate-passport.test.ts`     |
| Degradation (降格)                    | `PipelineDegradation`   | `resolveSource` for presets; the free-input Layer for `prose-failed`    | `LivePassport`, `FreeInputPassport`          | `src/features/passport/api/generate-passport.test.ts`, `src/features/passport/api/free-input.test.ts`               |
| Free-input request (自由入力の入力値) | `FreeInputRequest`      | `decodeFreeInputDraft` at the form, the schema at the server boundary   | `FreeInputForm`                              | `src/features/passport/utils/free-input-draft.test.ts`, `src/features/passport/components/free-input-form.test.tsx` |
| Stream request (生成リクエスト)       | `PassportStreamRequest` | `resolveSource` — `live` is a request the server may overrule           | `LivePassport`                               | `src/features/passport/api/generate-passport.test.ts`, `src/features/passport/api/passport-server.test.ts`          |
| Live mode (ライブ/キャッシュ切替)     | `LiveSearch`            | — (`decodeLiveSearch` reads it off the URL; the server decides)         | the `/` and `/passport/$personaId` switches  | `src/features/passport/types/live-search.test.ts`                                                                   |

## Deterministic / LLM boundary

This is the project's central design claim, and the reason the rest of the ledger exists.
See [ADR 0003](docs/adr/0003-deterministic-scoring.md).

### The four steps

Every LLM step is named after its module in `src/features/passport/api/steps/`. **None of them may
decide anything but prose.**

| step                | module           | may decide                                                     | may NOT decide                                                |
| ------------------- | ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `extract-skills`    | step 1           | which vocabulary ids a résumé mentions, and a summary sentence | anything outside `SkillId`; anything past `SkillSet`'s bounds |
| `translate-skills`  | step 3           | the English phrasing of a skill                                | which skills exist                                            |
| `explain-country`   | step 2's wording | the sentences describing a finished assessment                 | the grade, the score, eligibility, blocked reasons            |
| `explain-job-match` | step 4's wording | the sentence describing a finished match                       | the score, the ordering, the exclusions                       |

Step 1 is the one place a model's output becomes a judgement input, which is why `SkillSet` is
bounded at the schema rather than downstream: an invented skill id or an absurd `experienceYears`
dies at decode time, before it can reach a score. The prompts are plain functions
(`extractSkillsPrompt`, `translateSkillsPrompt`, `explainCountryPrompt`, `explainJobMatchPrompt`)
so they can be asserted directly — see `src/features/passport/api/steps/prompts.test.ts`.

`explain-country` and `explain-job-match` are handed the **finished** assessment, not the raw data.
That removes the path by which prose could disagree with the judgement.

### The deterministic counterparts

| decision               | function                                                | module                           |
| ---------------------- | ------------------------------------------------------- | -------------------------------- |
| one visa's verdict     | `assessVisa`                                            | `src/domain/visa-eligibility.ts` |
| one country's grade    | `assessCountry`, `assessAllCountries`, `gradeFromScore` | `src/domain/visa-eligibility.ts` |
| can this chef be hired | `isAttainableJob`                                       | `src/domain/visa-eligibility.ts` |
| one job's match score  | `scoreJobMatch`                                         | `src/domain/scoring.ts`          |
| ranking and exclusions | `rankJobMatches`                                        | `src/domain/scoring.ts`          |

Supporting helpers that decide nothing on their own but which every number above passes through:
`languageRank` (`src/domain/language-level.ts`) turns the language union into a comparable rank,
and `toMonthlyAmount` and `clamp01` (`src/domain/market.ts`) normalise a salary period and bound a
ratio to 0–1. They are listed here rather than in the ledger because no domain term is theirs.

`src/domain/` imports neither Effect, nor React, nor any AI package. That is what makes the
judgement testable without a harness — `src/domain/expected-outcomes.test.ts` asserts the persona →
grade table from `docs/requirement.md` directly, and it is the evidence for the whole design claim.

### Assembly

`assessDeterministically` (`src/features/passport/api/build-passport.ts`) is the one function that
runs the deterministic half inside the pipeline: it calls `assessAllCountries`, derives which
countries have a sponsor-free visa, and hands that to `rankJobMatches`. Both the live pipeline and
the deterministic fallback (`deterministicProse`) call it, so there is one implementation of the
judgement and not two. `joinPassportView` then joins the result to the jobs and visas the screen
needs, and is pure data plumbing — it decides nothing.

### Hard constraints exclude rather than subtract

Sponsorship unavailable, age over a visa's cap, experience below its minimum, missing evidence of
excellence, no seasonal role, salary below the visa's floor: each of these **removes** an option and
records why, instead of docking points.

- `assessVisa` collects **every** violated constraint into `blockedReasonsJa` and sets
  `eligible: false`. `CountryGradeCard` renders that list under the visa it belongs to.
- `rankJobMatches` moves an unsponsorable job into `excluded` with a `reasonJa`, rather than scoring
  it to zero — a zero is indistinguishable from a bad fit. `JobMatchList` renders the excluded jobs
  behind a count, with their reasons.

**The rendered reason is the visible proof the logic exists.** A bare grade or a ranked list alone
would be indistinguishable from model output, which is exactly the claim this project is making.

### The live path

Cache replay is not the only path, and the ledger is not honest if it only describes that one.

**One tag, two Layers.** `PassportPipeline` (`src/features/passport/api/pipeline-service.ts`) is
resolved either by `PipelineLive` or by `pipelineFromCache`, composed in the single composition
point `src/lib/runtime.ts` (`passportPipelineLive`, `passportPipelineFromCache`). Both emit the same
`Stream<PipelineEvent>`, so the UI never branches on the source.

**Model split** (`src/lib/model-roles.ts`). Two roles, two models, resolved through
`ExtractionLanguageModel` and `ProseLanguageModel` and bound to steps in one place rather than four:

- `EXTRACTION_MODEL` = `anthropic/claude-haiku-4.5` — `extract-skills` and `translate-skills`, which
  are structural and cheap.
- `PROSE_MODEL` = `anthropic/claude-sonnet-5` — `explain-country` and `explain-job-match`, the two
  texts a human actually reads.
- `MODEL_ROLES` names each role's gateway fallback as the _other_ role's model, so a single-model
  outage costs the demo money or polish, not the run. Routing is
  [ADR 0002](docs/adr/0002-ai-gateway-routing.md).

**Guards, all server-side.** There is no feature flag; live generation is gated on the presence of
`AI_GATEWAY_API_KEY` alone (owner decision, 2026-07-30 — see `.claude/rules/common/security.md`):

1. `hasGatewayKey` (`src/lib/gateway-key.ts`) — no key, no gateway call, ever.
2. `presetSingleFlight` / `freeInputSingleFlight` (`src/features/passport/api/single-flight.ts`) —
   bounds concurrency: three preset runs, one per persona; one free-input run for the whole process.
3. `liveRunBudget` / `createRunBudget` (`src/features/passport/api/live-run-budget.ts`) — a token
   bucket bounding _volume_, because one live run is roughly 17 gateway calls and nothing else
   stopped a caller repeating it serially. A refusal costs no token.
4. `MAX_RESUME_LENGTH`, `MIN_RESUME_LENGTH` and the age bounds, enforced in `FreeInputRequest`
   rather than only in the UI.

Guards 1–3 are **per instance** — module state, so N serverless instances multiply the bound by N.
The only limit that spans instances is the per-key spend ceiling in the AI Gateway dashboard.

**A preset degrades; free input refuses.** `resolveSource`
(`src/features/passport/api/generate-passport.ts`) turns a blocked live request into a full cache
replay carrying `degraded` — `no-key`, `in-flight`, `rate-limited`, or `live-failed` after the fact.
A stranger's résumé has no cache, so `streamFreeInputEvents`
(`src/features/passport/api/free-input.ts`) answers with a `Failed` event instead; its one
degradation, `prose-failed`, is the case where the judgement survived and only the wording did not.
Either way the outcome is shown on screen, never swallowed.

**The committed cache stays generated output.** `src/data/cache/` is produced by
`scripts/generate-passport.ts` (`vp run generate:passport`) and must never be hand-edited;
`src/data/cache-contract.test.ts` decodes every file against the current schemas and re-runs the
domain logic against it, which is what catches a schema or rule change invalidating it.

## Keeping this file honest

`src/data/context-ledger.test.ts` asserts that every schema exported from `src/data/schemas.ts` and
every exported function in `src/domain/` is named somewhere above. Adding either without a ledger
entry fails the build. The reasoning behind that granularity is
[ADR 0004](docs/adr/0004-ssot-traceability-ledger.md).
