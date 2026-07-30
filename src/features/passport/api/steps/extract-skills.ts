import { LanguageModel } from "@effect/ai";
import { Effect } from "effect";

import type { SkillVocabularyEntry } from "~/data/schemas";
import { SkillSet } from "~/data/schemas";

/**
 * Step 1 — LLM. Turning unstructured Japanese résumé prose into a structured record is exactly
 * what a model is for. It is constrained to the shared skill vocabulary: free-form skill strings
 * would silently degrade every downstream match to zero.
 */
export function extractSkillsPrompt(
  resumeJa: string,
  vocabulary: readonly SkillVocabularyEntry[],
): string {
  const options = vocabulary.map((entry) => `- ${entry.id}: ${entry.labelJa}`).join("\n");

  return `あなたは日本の飲食業界に詳しい採用アナリストです。
以下のシェフの経歴文を読み、構造化データに変換してください。

## 制約
- skills は必ず下記の語彙IDから選ぶこと。該当しない技能は含めない。
- experienceYears は経歴文から読み取れる実務年数（整数）。
- languageLevel は none / basic / conversational / business のいずれか。
- primaryGenre は sushi / kaiseki / french / bistro / ramen / hotel_japanese のいずれか。
- summaryJa は日本語1〜2文で、この人の強みを要約する。

## 選択可能なスキル語彙
${options}

## 経歴文
${resumeJa}`;
}

export function extractSkills(resumeJa: string, vocabulary: readonly SkillVocabularyEntry[]) {
  return LanguageModel.generateObject({
    objectName: "skillSet",
    prompt: extractSkillsPrompt(resumeJa, vocabulary),
    schema: SkillSet,
  }).pipe(Effect.map((response) => response.value));
}
