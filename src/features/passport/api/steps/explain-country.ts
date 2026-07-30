import { LanguageModel } from "@effect/ai";
import { Effect, Schema } from "effect";

import type { Country, CountryAssessment, Persona, VisaRequirement } from "~/data/schemas";

/**
 * Step 2's *wording only*. The grade, the score and every blocked reason arrive already decided by
 * `src/domain/visa-eligibility.ts`; the model is told the outcome and asked to narrate it.
 *
 * Handing the model the finished assessment rather than the raw data is deliberate — it removes any
 * path by which the prose could disagree with the judgement.
 * See docs/adr/0003-deterministic-scoring.md.
 */
const CountryExplanation = Schema.Struct({
  explanationJa: Schema.String,
});

const COUNTRY_LABELS_JA = {
  AU: "オーストラリア",
  SG: "シンガポール",
  US: "アメリカ",
} as const satisfies Record<Country, string>;

export function explainCountryPrompt(
  persona: Persona,
  assessment: CountryAssessment,
  countryVisas: readonly VisaRequirement[],
): string {
  const visaLines = assessment.visas
    .map((visa) => {
      const requirement = countryVisas.find((item) => item.id === visa.visaId);
      const status = visa.eligible
        ? `適合（スコア ${visa.score}）`
        : `不適合（理由: ${visa.blockedReasonsJa.join(" / ")}）`;
      return `- ${requirement?.name ?? visa.visaId}: ${status}`;
    })
    .join("\n");

  return `あなたは海外就労を支援するキャリアアドバイザーです。
判定結果はすでに確定しています。あなたの仕事は、その結果を日本語で説明する文章を書くことだけです。

## 制約
- 判定を覆したり、別の結論を示唆したりしない。
- 適合度と不適合の理由を、確定した内容のまま2〜3文で説明する。
- 不適合のビザがある場合は、その理由に必ず触れる。
- 法的助言に読める表現は使わない。

## 対象シェフ
${persona.name}（${persona.age}歳・経験${persona.experienceYears}年・${persona.primaryGenre}）

## 確定した判定：${COUNTRY_LABELS_JA[assessment.country]}
総合適合度: ${assessment.grade}
${visaLines}`;
}

export function explainCountry(
  persona: Persona,
  assessment: CountryAssessment,
  countryVisas: readonly VisaRequirement[],
) {
  return LanguageModel.generateObject({
    objectName: "countryExplanation",
    prompt: explainCountryPrompt(persona, assessment, countryVisas),
    schema: CountryExplanation,
  }).pipe(Effect.map((response) => response.value.explanationJa));
}
