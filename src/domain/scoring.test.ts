import { describe, expect, it } from "vite-plus/test";

import type { Country, Job, Persona } from "~/data/schemas";
import { rankJobMatches, scoreJobMatch } from "~/domain/scoring";

const CHEF: Persona = {
  age: 30,
  experienceYears: 6,
  hasEvidenceProof: false,
  id: "test-chef",
  languageLevel: "business",
  name: "テスト",
  primaryGenre: "sushi",
  resumeJa: "テスト用",
  skills: ["sashimi-slicing", "yanagiba-knife", "nigiri-forming"],
};

const PERFECT_JOB: Job = {
  city: "Test City",
  country: "SG",
  descriptionJa: "テスト",
  id: "perfect",
  isSeasonal: false,
  minExperienceYears: 6,
  requiredLanguage: "business",
  requiredSkills: ["sashimi-slicing", "yanagiba-knife"],
  salary: { amount: 7500, currency: "SGD", period: "month" },
  sponsorshipAvailable: true,
  titleJa: "テスト求人",
  venueType: "sushi",
};

const ALL_SPONSOR_FREE = {
  AU: true,
  SG: true,
  US: true,
} as const satisfies Record<Country, boolean>;

const NO_SPONSOR_FREE = {
  AU: false,
  SG: false,
  US: false,
} as const satisfies Record<Country, boolean>;

describe("scoreJobMatch", () => {
  it("全項目を満たせば100点で指摘もない", () => {
    const result = scoreJobMatch(CHEF, PERFECT_JOB);

    expect(result.score).toBe(100);
    expect(result.notesJa).toStrictEqual([]);
    expect(result.jobId).toBe("perfect");
  });

  it("必要スキルの充足率で配点40が按分される", () => {
    const result = scoreJobMatch(CHEF, {
      ...PERFECT_JOB,
      requiredSkills: ["sashimi-slicing", "sauce-work"],
    });

    // スキル40点のうち半分を失う。
    expect(result.score).toBe(80);
    expect(result.notesJa.join()).toContain("2件のうち1件が未充足");
  });

  it("経験不足は配点20の範囲で減点し、除外はしない", () => {
    const result = scoreJobMatch(CHEF, { ...PERFECT_JOB, minExperienceYears: 12 });

    expect(result.score).toBe(90);
    expect(result.notesJa.join()).toContain("必要経験12年に対して6年で不足");
  });

  it("語学不足は配点20の範囲で減点し、除外はしない", () => {
    const result = scoreJobMatch({ ...CHEF, languageLevel: "none" }, PERFECT_JOB);

    expect(result.score).toBe(80);
    expect(result.notesJa.join()).toContain("要求語学「ビジネスレベル」に対して「ほぼ不可」");
  });

  it("語学要件がなければ語学は満点", () => {
    expect(
      scoreJobMatch(
        { ...CHEF, languageLevel: "none" },
        { ...PERFECT_JOB, requiredLanguage: "none" },
      ).score,
    ).toBe(100);
  });

  it("同系ジャンルは部分点、異系ジャンルは0点", () => {
    const adjacent = scoreJobMatch(CHEF, { ...PERFECT_JOB, venueType: "ramen" });
    const distant = scoreJobMatch(CHEF, { ...PERFECT_JOB, venueType: "bistro" });

    expect(adjacent.score).toBe(95);
    expect(distant.score).toBe(90);
    expect(adjacent.notesJa.join()).toContain("専門ジャンルとの一致度が低い");
  });

  it("給与は国別の基準額に対する比率で配点10が按分される", () => {
    const result = scoreJobMatch(CHEF, {
      ...PERFECT_JOB,
      salary: { amount: 3750, currency: "SGD", period: "month" },
    });

    // 3,750 / 7,500 = 0.5 → 給与10点のうち5点。
    expect(result.score).toBe(95);
  });

  it("年額の給与も月額に正規化する", () => {
    expect(
      scoreJobMatch(CHEF, {
        ...PERFECT_JOB,
        salary: { amount: 90000, currency: "SGD", period: "year" },
      }).score,
    ).toBe(100);
  });
});

describe("rankJobMatches", () => {
  it("スコア降順に並べる", () => {
    const weaker: Job = { ...PERFECT_JOB, id: "weaker", venueType: "bistro" };

    const { matches } = rankJobMatches(CHEF, [weaker, PERFECT_JOB], ALL_SPONSOR_FREE);

    expect(matches.map((match) => match.jobId)).toStrictEqual(["perfect", "weaker"]);
  });

  it("同点は jobId で決着させ、並びを再現可能にする", () => {
    const first: Job = { ...PERFECT_JOB, id: "bbb" };
    const second: Job = { ...PERFECT_JOB, id: "aaa" };

    expect(
      rankJobMatches(CHEF, [first, second], ALL_SPONSOR_FREE).matches.map((match) => match.jobId),
    ).toStrictEqual(["aaa", "bbb"]);
  });

  it("スポンサー不可の求人は、スポンサー不要ビザがなければ理由付きで除外する", () => {
    const noSponsor: Job = { ...PERFECT_JOB, id: "no-sponsor", sponsorshipAvailable: false };

    const { excluded, matches } = rankJobMatches(CHEF, [noSponsor], NO_SPONSOR_FREE);

    expect(matches).toStrictEqual([]);
    expect(excluded).toStrictEqual([
      {
        jobId: "no-sponsor",
        reasonJa:
          "ビザスポンサー不可の求人。この国で取得可能なスポンサー不要のビザがないため対象外",
      },
    ]);
  });

  it("スポンサー不要ビザがあればスポンサー不可の求人も対象に含める", () => {
    const noSponsor: Job = { ...PERFECT_JOB, id: "no-sponsor", sponsorshipAvailable: false };

    const { excluded, matches } = rankJobMatches(CHEF, [noSponsor], ALL_SPONSOR_FREE);

    expect(excluded).toStrictEqual([]);
    expect(matches.map((match) => match.jobId)).toStrictEqual(["no-sponsor"]);
  });

  it("除外は0点ではなく別枠にする（0点は「相性が悪い」と区別できない）", () => {
    const noSponsor: Job = { ...PERFECT_JOB, id: "no-sponsor", sponsorshipAvailable: false };

    const { matches } = rankJobMatches(CHEF, [noSponsor, PERFECT_JOB], NO_SPONSOR_FREE);

    expect(matches.some((match) => match.jobId === "no-sponsor")).toBe(false);
  });

  it("スポンサー可否の判定は求人の国ごとに行う", () => {
    const sgNoSponsor: Job = { ...PERFECT_JOB, id: "sg", sponsorshipAvailable: false };
    const auNoSponsor: Job = {
      ...PERFECT_JOB,
      country: "AU",
      id: "au",
      sponsorshipAvailable: false,
    };

    const { excluded, matches } = rankJobMatches(CHEF, [sgNoSponsor, auNoSponsor], {
      AU: true,
      SG: false,
      US: false,
    });

    expect(excluded.map((item) => item.jobId)).toStrictEqual(["sg"]);
    expect(matches.map((match) => match.jobId)).toStrictEqual(["au"]);
  });
});
