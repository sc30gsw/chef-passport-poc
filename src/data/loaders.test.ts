import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  ChefDataError,
  loadJobs,
  loadPersona,
  loadPersonas,
  loadSkillVocabulary,
  loadVisaRequirements,
} from "~/data/loaders";
import { SkillId } from "~/data/schemas";
import { DEMO_COUNTRIES } from "~/domain/visa-eligibility";

const visas = Effect.runSync(loadVisaRequirements);
const jobs = Effect.runSync(loadJobs);
const personas = Effect.runSync(loadPersonas);
const vocabulary = Effect.runSync(loadSkillVocabulary);

describe("コミット済みデータのデコード", () => {
  it("4種のリソースがすべて現行スキーマでデコードできる", () => {
    expect(visas.length).toBe(6);
    expect(jobs.length).toBe(15);
    expect(personas.length).toBe(3);
    expect(vocabulary.length).toBeGreaterThan(0);
  });

  it("存在しないペルソナIDは ChefDataError になる", () => {
    expect(Effect.runSync(Effect.flip(loadPersona("does-not-exist")))).toBeInstanceOf(
      ChefDataError,
    );
  });

  it("存在するペルソナIDは解決できる", () => {
    expect(Effect.runSync(loadPersona("sato-takumi")).name).toBe("佐藤 匠");
  });
});

describe("スキル語彙の契約", () => {
  it("JSONのidとSkillIdのunionが完全に一致する", () => {
    // 語彙表とスキーマがずれると、全マッチが静かに0点になる。
    expect([...vocabulary.map((entry) => entry.id)].sort()).toStrictEqual(
      [...SkillId.literals].sort(),
    );
  });

  it("idが重複していない", () => {
    const ids = vocabulary.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("求人の requiredSkills はすべて語彙表に載っている", () => {
    const known = new Set<string>(vocabulary.map((entry) => entry.id));

    for (const job of jobs) {
      for (const skill of job.requiredSkills) {
        expect(known.has(skill)).toBe(true);
      }
    }
  });

  it("ペルソナのスキルはすべて語彙表に載っている", () => {
    const known = new Set<string>(vocabulary.map((entry) => entry.id));

    for (const persona of personas) {
      for (const skill of persona.skills) {
        expect(known.has(skill)).toBe(true);
      }
    }
  });
});

describe("求人・ビザデータの意図した配分（PLAN.md §2.4）", () => {
  it.each(DEMO_COUNTRIES)("%s は求人5件、スポンサー可4件・不可1件", (country) => {
    const countryJobs = jobs.filter((job) => job.country === country);

    expect(countryJobs.length).toBe(5);
    expect(countryJobs.filter((job) => job.sponsorshipAvailable).length).toBe(4);
    // 不可1件があることで除外パスが必ず発火する。
    expect(countryJobs.filter((job) => !job.sponsorshipAvailable).length).toBe(1);
  });

  it.each(DEMO_COUNTRIES)(
    "%s の要求語学は business 2件 / conversational 2件 / basic 1件",
    (country) => {
      const countryJobs = jobs.filter((job) => job.country === country);
      const countOf = (level: string) =>
        countryJobs.filter((job) => job.requiredLanguage === level).length;

      expect(countOf("business")).toBe(2);
      expect(countOf("conversational")).toBe(2);
      expect(countOf("basic")).toBe(1);
    },
  );

  it.each(DEMO_COUNTRIES)("%s のビザは2種", (country) => {
    expect(visas.filter((visa) => visa.country === country).length).toBe(2);
  });

  it("求人IDとビザIDは一意", () => {
    expect(new Set(jobs.map((job) => job.id)).size).toBe(jobs.length);
    expect(new Set(visas.map((visa) => visa.id)).size).toBe(visas.length);
  });

  it("すべてのビザが実在の政府ページを出典に持つ", () => {
    const officialHosts = ["immi.homeaffairs.gov.au", "www.mom.gov.sg", "www.uscis.gov"];

    for (const visa of visas) {
      expect(officialHosts.some((host) => visa.sourceUrl.startsWith(`https://${host}/`))).toBe(
        true,
      );
    }
  });

  it("各ビザが制度の説明を持つ（数値の出典と取得日を含む）", () => {
    for (const visa of visas) {
      expect(visa.durationNote.length).toBeGreaterThan(0);
    }
  });

  it("年齢上限は417のみ、実績証明はO-1のみ、季節性はH-2Bのみ", () => {
    expect(
      visas.filter((visa) => visa.maxAgeYears !== undefined).map((visa) => visa.id),
    ).toStrictEqual(["au-417-working-holiday"]);
    expect(visas.filter((visa) => visa.requiresEvidenceProof).map((visa) => visa.id)).toStrictEqual(
      ["us-o1"],
    );
    expect(visas.filter((visa) => visa.requiresSeasonalRole).map((visa) => visa.id)).toStrictEqual([
      "us-h2b",
    ]);
  });

  it("ペルソナの年齢は417の年齢判定を発火させる分布になっている", () => {
    const cap = visas.find((visa) => visa.id === "au-417-working-holiday")?.maxAgeYears ?? 0;

    // 上限を超えるのは佐藤だけ。年齢という単一の属性で417の可否が分かれることが、
    // ワーキングホリデーの提示がハードコードではなくデータから出ている証拠になる。
    // （docs/requirement.md は「高橋のみ上限内」と書くが、28歳の鈴木も上限内。
    //   鈴木と高橋を分けているのは年齢ではなく482の所得下限で、
    //   その分岐は expected-outcomes.test.ts が直接アサートしている。）
    expect(
      personas.filter((persona) => persona.age > cap).map((persona) => persona.id),
    ).toStrictEqual(["sato-takumi"]);
    expect(
      personas.filter((persona) => persona.age <= cap).map((persona) => persona.id),
    ).toStrictEqual(["suzuki-haruka", "takahashi-kenta"]);
  });

  it("US の求人はすべて通年（H-2Bの季節性要件が発火する前提）", () => {
    expect(jobs.filter((job) => job.country === "US").every((job) => !job.isSeasonal)).toBe(true);
  });
});
