import { LanguageModel } from "@effect/ai";
import { Effect, Schema } from "effect";

import type { Job, JobMatch, Persona } from "~/data/schemas";

/**
 * Step 4's *wording only*. `src/domain/scoring.ts` has already produced the number, the ranking and
 * the deterministic notes; the model turns those into a sentence a chef would want to read. Asking
 * it to score would make the ranking untestable — see docs/adr/0003-deterministic-scoring.md.
 */
const JobMatchReason = Schema.Struct({
  reasonJa: Schema.String,
});

export function explainJobMatchPrompt(persona: Persona, job: Job, match: JobMatch): string {
  const notes =
    match.notesJa.length === 0
      ? "（減点項目なし）"
      : match.notesJa.map((note) => `- ${note}`).join("\n");

  return `あなたは海外就労を支援するキャリアアドバイザーです。
マッチングスコアと減点理由はすでに算出済みです。あなたの仕事は理由文を1〜2文で書くことだけです。

## 制約
- スコアを変更したり、別の点数を示唆したりしない。
- 強みと、減点項目があればその点に触れる。
- 求人票の宣伝文にしない。事実に即して書く。

## 対象シェフ
${persona.name}（経験${persona.experienceYears}年・${persona.primaryGenre}）

## 求人
${job.titleJa}（${job.city}）
${job.descriptionJa}

## 確定したスコア: ${match.score} / 100
${notes}`;
}

export function explainJobMatch(persona: Persona, job: Job, match: JobMatch) {
  return LanguageModel.generateObject({
    objectName: "jobMatchReason",
    prompt: explainJobMatchPrompt(persona, job, match),
    schema: JobMatchReason,
  }).pipe(Effect.map((response) => response.value.reasonJa));
}
