# 0003 — Judgement is deterministic; only the wording is generated

- **Status:** accepted
- **Date:** 2026-07-30

## Context

The demo has four pipeline steps: extract skills, judge visa eligibility, translate skills,
match jobs. The obvious implementation asks the model to do all four — including "score these 15
jobs 0-100" and "is this chef eligible for an Employment Pass". That is one prompt and no domain
code.

It is also unverifiable, non-reproducible, and a weaker story. "I asked the model to score it"
cannot be tested; a threshold cannot be pointed at; a wrong answer cannot be explained.

## Decision

Eligibility and scoring are pure functions in `src/domain/`. The LLM produces only prose.

| Step                                            | Implementation                                         |
| ----------------------------------------------- | ------------------------------------------------------ |
| 1. Extract and structure skills                 | LLM — `generateObject` against a schema                |
| 2. Visa eligibility                             | deterministic + LLM for the explanation sentence only  |
| 3. Translate skills to local kitchen vocabulary | LLM — `generateObject`                                 |
| 4. Job matching                                 | deterministic score + LLM for the reason sentence only |

`src/domain/` imports neither Effect nor React nor any AI package. Hard constraints (sponsorship
unavailable, age over the cap, salary below the visa floor, missing evidence proof) **exclude**
rather than subtract, and the exclusion reason is rendered in the UI.

## Consequences

- The persona → grade table in `docs/requirement.md` is asserted directly as a test fixture
  (`src/domain/expected-outcomes.test.ts`). The table is fixed; the visa and job figures were
  tuned until it passed. That test is the evidence for the whole design claim.
- Deterministic output means preset personas can be pre-generated into a committed cache, which
  makes the demo reproducible, API-key-free, and immune to network failure.
- Moving any scoring or eligibility decision into a prompt is a regression, not a refactor.
- The visible exclusion reasons in the UI are the proof the logic exists — a ranked list alone
  would be indistinguishable from model output.
- Cost: the domain layer has to carry real rules, and the fixture has to be kept green. That is
  the point.
