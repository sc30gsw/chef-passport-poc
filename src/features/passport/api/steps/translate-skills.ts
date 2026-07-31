import { LanguageModel } from "@effect/ai";
import { Effect, Schema } from "effect";

import type { SkillId, SkillVocabularyEntry } from "~/data/schemas";
import { TranslatedSkill } from "~/data/schemas";

/**
 * Step 3 — LLM. The moment a Japanese craft term becomes a phrase a foreign head chef understands
 * is the point of the screen, so this is genuinely generative work.
 *
 * `generateObject` needs a struct at the top level, hence the wrapper.
 */
const TranslationResult = Schema.Struct({
  translations: Schema.Array(TranslatedSkill),
});

export function translateSkillsPrompt(
  skills: readonly SkillId[],
  vocabulary: readonly SkillVocabularyEntry[],
): string {
  const rows = skills
    .map((skillId) => {
      const entry = vocabulary.find((item) => item.id === skillId);
      return `- ${skillId}: ${entry?.labelJa ?? skillId}`;
    })
    .join("\n");

  return `あなたは海外の厨房で働く日本人シェフの通訳です。
日本の職人スキルを、現地の厨房でそのまま通用する英語表現に変換してください。

## 制約
- 各項目について skillId（入力のIDをそのまま）、sourceJa（日本語の元表現）、localEn（現地の等価表現）を返す。
- localEn は求人票やレジュメにそのまま書ける具体的な英語表現にする。直訳や説明文にしない。
- 入力されたスキルすべてについて1件ずつ返す。

## 変換対象
${rows}`;
}

export function translateSkills(
  skills: readonly SkillId[],
  vocabulary: readonly SkillVocabularyEntry[],
) {
  return LanguageModel.generateObject({
    objectName: "translations",
    prompt: translateSkillsPrompt(skills, vocabulary),
    schema: TranslationResult,
  }).pipe(Effect.map((response) => response.value.translations));
}
