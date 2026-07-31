import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { MAX_EXPERIENCE_YEARS, Persona, SkillSet, VisaRequirement } from "~/data/schemas";

/**
 * The bounds these tests assert are guards, not descriptions of chefs. `SkillSet` is the one place
 * the model's reading of a stranger's résumé becomes a judgement input — `experienceYears` is a hard
 * visa gate and 20 of the 100 match points — so the schema is where an absurd claim has to die.
 * See audit #16 findings 2, 6 and 7.
 */

const SKILL_SET = {
  experienceYears: 8,
  languageLevel: "conversational",
  primaryGenre: "sushi",
  skills: ["sashimi-slicing"],
  summaryJa: "銀座の割烹で8年。",
} as const;

const VISA = {
  country: "SG",
  durationNote: "2年（新規・更新可）",
  expectedLanguage: "conversational",
  id: "sg-employment-pass",
  minExperienceYears: 5,
  minSalary: { amount: 5600, currency: "SGD", period: "month" },
  name: "Employment Pass",
  requiresEvidenceProof: false,
  requiresSeasonalRole: false,
  requiresSponsor: true,
  sourceUrl: "https://www.mom.gov.sg/passes-and-permits/employment-pass/eligibility",
} as const;

const PERSONA = {
  age: 32,
  experienceYears: 8,
  hasEvidenceProof: false,
  id: "sato-takumi",
  languageLevel: "conversational",
  name: "佐藤 匠",
  primaryGenre: "sushi",
  resumeJa: "銀座の割烹で8年勤めました。",
  skills: ["sashimi-slicing"],
} as const;

const decodeSkillSet = Schema.decodeUnknownSync(SkillSet);
const decodeVisa = Schema.decodeUnknownSync(VisaRequirement);
const decodePersona = Schema.decodeUnknownSync(Persona);

describe("SkillSet — モデルが読み取った値の上限", () => {
  it("実務年数は上限までなら通る", () => {
    expect(decodeSkillSet({ ...SKILL_SET, experienceYears: MAX_EXPERIENCE_YEARS })).toBeDefined();
  });

  it.each([
    ["上限を超える実務年数", MAX_EXPERIENCE_YEARS + 1],
    ["経歴文が主張しうる桁違いの年数", 999],
    ["負の年数", -1],
    ["整数でない年数", 8.5],
  ])("%s はデコードで弾かれる", (_label, experienceYears) => {
    // 経歴文に「経験45年」と書くだけで全ビザの経験ゲートが開く、が塞がれていることの証拠。
    expect(() => decodeSkillSet({ ...SKILL_SET, experienceYears })).toThrow();
  });

  it("スキルが空の抽出結果は Persona の不変条件を破るので弾かれる", () => {
    expect(() => decodeSkillSet({ ...SKILL_SET, skills: [] })).toThrow();
  });
});

describe("Persona — 判定が走る値の上限", () => {
  it("実務年数の上限は SkillSet と同じ", () => {
    expect(decodePersona({ ...PERSONA, experienceYears: MAX_EXPERIENCE_YEARS })).toBeDefined();
    expect(() =>
      decodePersona({ ...PERSONA, experienceYears: MAX_EXPERIENCE_YEARS + 1 }),
    ).toThrow();
  });
});

describe("VisaRequirement — 画面に出る唯一のデータ由来リンク", () => {
  it("https の出典URLは通る", () => {
    expect(decodeVisa(VISA)).toBeDefined();
  });

  it.each([
    ["http", "http://www.mom.gov.sg/passes-and-permits"],
    ["javascript スキーム", "javascript:alert(1)"],
    ["スキームのない相対パス", "/passes-and-permits"],
  ])("%s の出典URLは弾かれる", (_label, sourceUrl) => {
    expect(() => decodeVisa({ ...VISA, sourceUrl })).toThrow();
  });
});
