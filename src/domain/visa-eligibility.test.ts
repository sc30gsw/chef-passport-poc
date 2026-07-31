import { describe, expect, it } from "vite-plus/test";

import type { Job, Persona, VisaRequirement } from "~/data/schemas";
import {
  assessCountry,
  assessVisa,
  gradeFromScore,
  isAttainableJob,
} from "~/domain/visa-eligibility";

/**
 * Synthetic fixtures, deliberately not the committed data: each test isolates one hard constraint
 * so a failure names the rule that broke rather than "the table moved".
 */

const CHEF: Persona = {
  age: 30,
  experienceYears: 6,
  hasEvidenceProof: false,
  id: "test-chef",
  languageLevel: "conversational",
  name: "テスト",
  primaryGenre: "sushi",
  resumeJa: "テスト用",
  skills: ["sashimi-slicing", "yanagiba-knife"],
};

const SPONSORING_JOB: Job = {
  city: "Test City",
  country: "SG",
  descriptionJa: "テスト",
  id: "test-job",
  isSeasonal: false,
  minExperienceYears: 3,
  requiredLanguage: "conversational",
  requiredSkills: ["sashimi-slicing"],
  salary: { amount: 8000, currency: "SGD", period: "month" },
  sponsorshipAvailable: true,
  titleJa: "テスト求人",
  venueType: "sushi",
};

const OPEN_VISA: VisaRequirement = {
  country: "SG",
  durationNote: "テスト",
  expectedLanguage: "conversational",
  id: "test-visa",
  minExperienceYears: 2,
  name: "テストビザ",
  requiresEvidenceProof: false,
  requiresSeasonalRole: false,
  requiresSponsor: false,
  sourceUrl: "https://example.test",
};

describe("isAttainableJob", () => {
  it("経験が足りていて必要スキルが1件でも重なれば到達可能", () => {
    expect(isAttainableJob(CHEF, SPONSORING_JOB)).toBe(true);
  });

  it("経験年数が足りなければ到達不可", () => {
    expect(isAttainableJob(CHEF, { ...SPONSORING_JOB, minExperienceYears: 10 })).toBe(false);
  });

  it("スキルが1件も重ならなければ到達不可", () => {
    expect(isAttainableJob(CHEF, { ...SPONSORING_JOB, requiredSkills: ["sauce-work"] })).toBe(
      false,
    );
  });

  it("語学が不足していても到達可能な求人として扱う（語学はソフト要素）", () => {
    expect(
      isAttainableJob(
        { ...CHEF, languageLevel: "none" },
        { ...SPONSORING_JOB, requiredLanguage: "business" },
      ),
    ).toBe(true);
  });
});

describe("assessVisa のハード制約", () => {
  it("制約に触れなければ eligible", () => {
    const result = assessVisa(CHEF, OPEN_VISA, [SPONSORING_JOB]);

    expect(result.eligible).toBe(true);
    expect(result.blockedReasonsJa).toStrictEqual([]);
  });

  it("スポンサー必須なのに到達可能なスポンサー求人がなければ除外", () => {
    const result = assessVisa(CHEF, { ...OPEN_VISA, requiresSponsor: true }, [
      { ...SPONSORING_JOB, sponsorshipAvailable: false },
    ]);

    expect(result.eligible).toBe(false);
    expect(result.blockedReasonsJa.join()).toContain("スポンサー企業が前提");
  });

  it("年齢上限を超えていれば除外", () => {
    const result = assessVisa({ ...CHEF, age: 31 }, { ...OPEN_VISA, maxAgeYears: 30 }, [
      SPONSORING_JOB,
    ]);

    expect(result.eligible).toBe(false);
    expect(result.blockedReasonsJa.join()).toContain("年齢上限30歳を超過");
  });

  it("年齢上限とちょうど同じなら除外しない", () => {
    expect(
      assessVisa({ ...CHEF, age: 30 }, { ...OPEN_VISA, maxAgeYears: 30 }, [SPONSORING_JOB])
        .eligible,
    ).toBe(true);
  });

  it("必要経験年数に届かなければ除外", () => {
    const result = assessVisa(CHEF, { ...OPEN_VISA, minExperienceYears: 10 }, [SPONSORING_JOB]);

    expect(result.eligible).toBe(false);
    expect(result.blockedReasonsJa.join()).toContain("必要年数10年に届かない");
  });

  it("実績証明が必要なのに実績がなければ除外", () => {
    const result = assessVisa(CHEF, { ...OPEN_VISA, requiresEvidenceProof: true }, [
      SPONSORING_JOB,
    ]);

    expect(result.eligible).toBe(false);
    expect(result.blockedReasonsJa.join()).toContain("卓越性を立証する実績がない");
  });

  it("実績があれば実績証明の制約は外れる", () => {
    expect(
      assessVisa(
        { ...CHEF, hasEvidenceProof: true },
        { ...OPEN_VISA, requiresEvidenceProof: true },
        [SPONSORING_JOB],
      ).eligible,
    ).toBe(true);
  });

  it("季節性のある求人が必要なのに通年求人しかなければ除外", () => {
    const result = assessVisa(CHEF, { ...OPEN_VISA, requiresSeasonalRole: true }, [SPONSORING_JOB]);

    expect(result.eligible).toBe(false);
    expect(result.blockedReasonsJa.join()).toContain("通年の常勤ポジション");
  });

  it("季節性のある求人が1件でもあれば季節性の制約は外れる", () => {
    expect(
      assessVisa(CHEF, { ...OPEN_VISA, requiresSeasonalRole: true }, [
        { ...SPONSORING_JOB, isSeasonal: true },
      ]).eligible,
    ).toBe(true);
  });

  it("到達可能な給与が下限に届かなければ除外し、実額を理由に出す", () => {
    const result = assessVisa(
      CHEF,
      { ...OPEN_VISA, minSalary: { amount: 9000, currency: "SGD", period: "month" } },
      [SPONSORING_JOB],
    );

    expect(result.eligible).toBe(false);
    expect(result.blockedReasonsJa.join()).toContain("到達可能な月額 8000 SGD");
    expect(result.blockedReasonsJa.join()).toContain("給与下限 9000 SGD");
  });

  it("年額の給与下限は月額に正規化して比較する", () => {
    // 96,000 / 12 = 8,000 — ちょうど下限に一致するので除外しない
    expect(
      assessVisa(
        CHEF,
        { ...OPEN_VISA, minSalary: { amount: 96000, currency: "SGD", period: "year" } },
        [SPONSORING_JOB],
      ).eligible,
    ).toBe(true);
  });

  it("違反した制約はすべて列挙する", () => {
    const result = assessVisa(
      { ...CHEF, age: 40, experienceYears: 1 },
      { ...OPEN_VISA, maxAgeYears: 30, minExperienceYears: 10, requiresEvidenceProof: true },
      [SPONSORING_JOB],
    );

    expect(result.blockedReasonsJa.length).toBe(3);
  });

  it("給与下限のないビザを無条件の満点にはしない", () => {
    const noFloor = assessVisa(CHEF, OPEN_VISA, [SPONSORING_JOB]);
    const generousFloor = assessVisa(
      CHEF,
      { ...OPEN_VISA, minSalary: { amount: 4000, currency: "SGD", period: "month" } },
      [SPONSORING_JOB],
    );

    // 下限を大きく上回って到達できるビザのほうが高く出る。
    expect(generousFloor.score).toBeGreaterThan(noFloor.score);
  });
});

describe("gradeFromScore", () => {
  it("適合ビザがなければ △", () => {
    expect(gradeFromScore(null)).toBe("△");
  });

  it.each([
    [0, "△"],
    [39, "△"],
    [40, "○"],
    [69, "○"],
    [70, "◎"],
    [100, "◎"],
  ])("スコア %i は %s", (score, grade) => {
    expect(gradeFromScore(score)).toBe(grade);
  });
});

describe("assessCountry", () => {
  it("適合ビザのうち最高スコアのものを採用する", () => {
    const weak: VisaRequirement = { ...OPEN_VISA, id: "weak", minExperienceYears: 6 };
    const strong: VisaRequirement = {
      ...OPEN_VISA,
      id: "strong",
      minSalary: { amount: 4000, currency: "SGD", period: "month" },
    };

    const result = assessCountry(CHEF, "SG", [weak, strong], [SPONSORING_JOB]);

    expect(result.bestVisaId).toBe("strong");
    expect(result.grade).not.toBe("△");
  });

  it("適合ビザが1つもなければ △ で bestVisaId は null", () => {
    const result = assessCountry(
      CHEF,
      "SG",
      [{ ...OPEN_VISA, minExperienceYears: 30 }],
      [SPONSORING_JOB],
    );

    expect(result.grade).toBe("△");
    expect(result.bestVisaId).toBeNull();
    expect(result.score).toBe(0);
  });

  it("スポンサー不要のビザが通っていれば sponsorFreeEligible が立つ", () => {
    expect(assessCountry(CHEF, "SG", [OPEN_VISA], [SPONSORING_JOB]).sponsorFreeEligible).toBe(true);
  });

  it("通ったビザがスポンサー必須のみなら sponsorFreeEligible は false", () => {
    const result = assessCountry(
      CHEF,
      "SG",
      [{ ...OPEN_VISA, requiresSponsor: true }],
      [SPONSORING_JOB],
    );

    expect(result.visas[0]?.eligible).toBe(true);
    expect(result.sponsorFreeEligible).toBe(false);
  });

  it("他国のビザと求人は対象にしない", () => {
    const result = assessCountry(CHEF, "AU", [OPEN_VISA], [SPONSORING_JOB]);

    expect(result.visas).toStrictEqual([]);
    expect(result.grade).toBe("△");
  });
});
