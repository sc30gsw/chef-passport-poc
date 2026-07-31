import { Effect, Either, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { lookupCachedPassport } from "~/data/cache-index";
import { loadJobs, loadPersona, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import {
  Country,
  CountryAssessment,
  CountryResult,
  ExcludedJob,
  Grade,
  Job,
  JobMatch,
  LanguageLevel,
  MAX_EXPERIENCE_YEARS,
  Money,
  PassportResult,
  Persona,
  PipelineStep,
  RankedJobMatch,
  SkillId,
  SkillSet,
  SkillVocabularyEntry,
  StepTiming,
  TranslatedSkill,
  VenueType,
  VisaAssessment,
  VisaRequirement,
} from "~/data/schemas";
import { rankJobMatches, scoreJobMatch } from "~/domain/scoring";
import { DEMO_COUNTRIES, assessAllCountries } from "~/domain/visa-eligibility";

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

/**
 * The SSoT surface. `effect-schema.md` makes `effect/Schema` the only validator and #19's
 * traceability ledger enumerates these schemas by symbol name, so every one of the 21 stays
 * exported — and every one earns it here rather than sitting on the dead-code list. See #13's
 * disposition table (criterion 2) and #20.
 *
 * Accept fixtures are drawn from what the app actually produces — the JSON loaders, the committed
 * cache, and the return values of `src/domain/` — so this doubles as evidence that the
 * deterministic half still satisfies the schemas it claims to. Reject fixtures hold the
 * `Schema.Literal`-over-`string` discipline: a widened `string` would move the failure from decode
 * time to scoring time, where it silently produces a zero.
 */

const jobs = Effect.runSync(loadJobs);
const visas = Effect.runSync(loadVisaRequirements);
const vocabulary = Effect.runSync(loadSkillVocabulary);
const sato = Effect.runSync(loadPersona("sato-takumi"));

const cached = lookupCachedPassport("sato-takumi");
if (cached === undefined) throw new Error("sato-takumi のキャッシュが読めない");

const firstJob = jobs[0];
const firstVocabularyEntry = vocabulary[0];
if (firstJob === undefined || firstVocabularyEntry === undefined) {
  throw new Error("静的フィクスチャが空になっている");
}

const assessments = assessAllCountries(sato, visas, jobs);

function sponsorFree(country: Country): boolean {
  return assessments.find((entry) => entry.country === country)?.sponsorFreeEligible ?? false;
}

const ranked = rankJobMatches(sato, jobs, {
  AU: sponsorFree("AU"),
  SG: sponsorFree("SG"),
  US: sponsorFree("US"),
});

/** `Either` rather than a thrown error: the reject half is an assertion, not an accident. */
function rejects<A, I>(schema: Schema.Schema<A, I>, value: unknown): boolean {
  return Either.isLeft(Schema.decodeUnknownEither(schema)(value));
}

describe("リテラル型のスキーマ — 判定が比較する値の集合そのもの", () => {
  it("Country は3か国だけを通す", () => {
    for (const country of DEMO_COUNTRIES) {
      expect(Schema.decodeUnknownSync(Country)(country)).toBe(country);
    }
    // 日本国内の求人はこのデモの対象外。string に広げると judgement 側まで届いてしまう。
    expect(rejects(Country, "JP")).toBe(true);
  });

  it("VenueType は求人データに出てくる業態をすべて通す", () => {
    for (const job of jobs) {
      expect(Schema.decodeUnknownSync(VenueType)(job.venueType)).toBe(job.venueType);
    }
    expect(rejects(VenueType, "izakaya")).toBe(true);
  });

  it("LanguageLevel はペルソナと求人の語学要件を通す", () => {
    expect(Schema.decodeUnknownSync(LanguageLevel)(sato.languageLevel)).toBe(sato.languageLevel);
    for (const job of jobs) {
      expect(Schema.decodeUnknownSync(LanguageLevel)(job.requiredLanguage)).toBeDefined();
    }
    expect(rejects(LanguageLevel, "native")).toBe(true);
  });

  it("SkillId は語彙JSONのidをすべて通す", () => {
    for (const entry of vocabulary) {
      expect(Schema.decodeUnknownSync(SkillId)(entry.id)).toBe(entry.id);
    }
    expect(rejects(SkillId, "teppanyaki")).toBe(true);
  });

  it("Grade は3段階。× は存在しない", () => {
    for (const assessment of assessments) {
      expect(Schema.decodeUnknownSync(Grade)(assessment.grade)).toBe(assessment.grade);
    }
    // requirement.md の等級は3段階。× を足すと「△ が制約を名指す」という語りが壊れる。
    expect(rejects(Grade, "×")).toBe(true);
  });

  it("PipelineStep はキャッシュに記録された4ステップを通す", () => {
    for (const timing of cached.timings) {
      expect(Schema.decodeUnknownSync(PipelineStep)(timing.step)).toBe(timing.step);
    }
    expect(rejects(PipelineStep, "explain")).toBe(true);
  });
});

describe("静的データのスキーマ — JSONフィクスチャをそのまま通す", () => {
  it("Money は全求人の給与を通し、0円は弾く", () => {
    for (const job of jobs) {
      expect(Schema.decodeUnknownSync(Money)(job.salary)).toStrictEqual(job.salary);
    }
    // positive() フィルタの証拠。0 は「無給」ではなく「データが壊れている」。
    expect(rejects(Money, { ...firstJob.salary, amount: 0 })).toBe(true);
    expect(rejects(Money, { ...firstJob.salary, currency: "JPY" })).toBe(true);
  });

  it("Job は jobs.json の全件を通す", () => {
    for (const job of jobs) expect(Schema.decodeUnknownSync(Job)(job)).toStrictEqual(job);
    expect(rejects(Job, { ...firstJob, requiredSkills: [] })).toBe(true);
  });

  it("VisaRequirement は visa-requirements.json の全件を通す", () => {
    for (const visa of visas) expect(Schema.decodeUnknownSync(VisaRequirement)(visa)).toBeDefined();
  });

  it("SkillVocabularyEntry は語彙JSONの全件を通す", () => {
    for (const entry of vocabulary) {
      expect(Schema.decodeUnknownSync(SkillVocabularyEntry)(entry)).toStrictEqual(entry);
    }
    expect(rejects(SkillVocabularyEntry, { ...firstVocabularyEntry, id: "teppanyaki" })).toBe(true);
  });

  it("Persona はペルソナJSONを通す", () => {
    expect(Schema.decodeUnknownSync(Persona)(sato)).toStrictEqual(sato);
  });
});

describe("ドメイン関数の戻り値 — 判定の出力がスキーマを満たし続けている証拠", () => {
  it("VisaAssessment は assessAllCountries が返したビザ判定を通す", () => {
    for (const assessment of assessments) {
      for (const visa of assessment.visas) {
        expect(Schema.decodeUnknownSync(VisaAssessment)(visa)).toStrictEqual(visa);
      }
    }
    expect(rejects(VisaAssessment, { ...assessments[0]?.visas[0], eligible: "yes" })).toBe(true);
  });

  it("CountryAssessment は assessAllCountries の各要素を通す", () => {
    for (const assessment of assessments) {
      expect(Schema.decodeUnknownSync(CountryAssessment)(assessment)).toStrictEqual(assessment);
    }
    expect(rejects(CountryAssessment, { ...assessments[0], grade: "×" })).toBe(true);
  });

  it("JobMatch は scoreJobMatch の戻り値を通す", () => {
    for (const job of jobs) {
      const match = scoreJobMatch(sato, job);
      expect(Schema.decodeUnknownSync(JobMatch)(match)).toStrictEqual(match);
    }
  });

  it("ExcludedJob は rankJobMatches が除外した求人を通す", () => {
    expect(ranked.excluded.length).toBeGreaterThan(0);
    for (const excluded of ranked.excluded) {
      expect(Schema.decodeUnknownSync(ExcludedJob)(excluded)).toStrictEqual(excluded);
    }
  });
});

describe("パイプライン出力のスキーマ — 事前生成キャッシュの各要素", () => {
  it("StepTiming は timings の全件を通す", () => {
    for (const timing of cached.timings) {
      expect(Schema.decodeUnknownSync(StepTiming)(timing)).toStrictEqual(timing);
    }
    expect(rejects(StepTiming, { ...cached.timings[0], step: "explain" })).toBe(true);
  });

  it("TranslatedSkill は translatedSkills の全件を通す", () => {
    for (const raw of cached.translatedSkills) {
      const translated: TranslatedSkill = Schema.decodeUnknownSync(TranslatedSkill)(raw);
      expect(translated).toStrictEqual(raw);
    }
  });

  it("CountryResult は countries の全件を通す", () => {
    for (const raw of cached.countries) {
      const country: CountryResult = Schema.decodeUnknownSync(CountryResult)(raw);
      expect(country.explanationJa.length).toBeGreaterThan(0);
    }
    // CountryAssessment に説明文が足りないだけの値は CountryResult ではない。
    expect(rejects(CountryResult, assessments[0])).toBe(true);
  });

  it("RankedJobMatch は jobMatches の全件を通す", () => {
    for (const raw of cached.jobMatches) {
      const match: RankedJobMatch = Schema.decodeUnknownSync(RankedJobMatch)(raw);
      expect(match.reasonJa.length).toBeGreaterThan(0);
    }
    // JobMatch に理由文が足りないだけの値は RankedJobMatch ではない。
    expect(rejects(RankedJobMatch, scoreJobMatch(sato, firstJob))).toBe(true);
  });

  it("SkillSet はキャッシュの skillSet を通す", () => {
    expect(Schema.decodeUnknownSync(SkillSet)(cached.skillSet)).toStrictEqual(cached.skillSet);
  });

  it("PassportResult は proseSource を2値に固定する", () => {
    expect(Schema.decodeUnknownSync(PassportResult)(cached)).toBeDefined();
    // 決定論フォールバック文をモデル出力として通してはならない。
    expect(rejects(PassportResult, { ...cached, proseSource: "cache" })).toBe(true);
  });
});
