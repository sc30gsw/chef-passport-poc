import type { LanguageLevel } from "~/data/schemas";

/**
 * The ordering the deterministic functions compare against. `LanguageLevel` is a
 * `Schema.Literal` union, so a typo here is a compile error rather than a silent zero score.
 */
export const LANGUAGE_LEVEL_ORDER = [
  "none",
  "basic",
  "conversational",
  "business",
] as const satisfies readonly LanguageLevel[];

export const LANGUAGE_LABELS_JA = {
  basic: "簡単な英会話",
  business: "ビジネスレベル",
  conversational: "日常会話レベル",
  none: "ほぼ不可",
} as const satisfies Record<LanguageLevel, string>;

export function languageRank(level: LanguageLevel): number {
  return LANGUAGE_LEVEL_ORDER.indexOf(level);
}
