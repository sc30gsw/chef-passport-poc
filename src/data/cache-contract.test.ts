import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { CACHED_PERSONA_IDS, RAW_CACHE_SOURCES, lookupCachedPassport } from "~/data/cache-index";
import { loadJobs, loadPersonas, loadVisaRequirements } from "~/data/loaders";
import { PassportResult } from "~/data/schemas";
import { assessAllCountries } from "~/domain/visa-eligibility";

/**
 * The committed cache is generated output frozen in git. This is the only thing that catches a
 * schema change invalidating it — without this test a renamed field would surface as a blank screen
 * during the demo instead of as a red test.
 */
describe("コミット済みキャッシュの契約", () => {
  it.each(RAW_CACHE_SOURCES.map((source) => source.id))(
    "%s は現行スキーマでデコードできる",
    (id) => {
      const source = RAW_CACHE_SOURCES.find((item) => item.id === id);

      expect(Schema.decodeUnknownSync(PassportResult)(source?.raw)).toBeDefined();
    },
  );

  it("プリセット3人分そろっている", () => {
    expect(CACHED_PERSONA_IDS).toStrictEqual(["sato-takumi", "suzuki-haruka", "takahashi-kenta"]);
  });

  it("personaId がファイル名と一致する", () => {
    for (const id of CACHED_PERSONA_IDS) {
      expect(lookupCachedPassport(id)?.personaId).toBe(id);
    }
  });

  it("4ステップぶんの実測msを持つ", () => {
    for (const id of CACHED_PERSONA_IDS) {
      expect(lookupCachedPassport(id)?.timings.map((timing) => timing.step)).toStrictEqual([
        "extract",
        "visa",
        "translate",
        "match",
      ]);
    }
  });

  it("文章の出所が記録されている", () => {
    for (const id of CACHED_PERSONA_IDS) {
      // 決定論的なフォールバック文をLLM出力として通してしまわないための記録。
      expect(["deterministic", "llm"]).toContain(lookupCachedPassport(id)?.proseSource);
    }
  });

  it("キャッシュの適合度が、いまのドメインロジックの再計算と一致する", () => {
    const visas = Effect.runSync(loadVisaRequirements);
    const jobs = Effect.runSync(loadJobs);

    // キャッシュは生成物。ロジックやデータを変えたら再生成が必要になる。それを検知する。
    for (const persona of Effect.runSync(loadPersonas)) {
      const recomputed = assessAllCountries(persona, visas, jobs);
      const cached = lookupCachedPassport(persona.id);

      expect(cached?.countries.map((country) => [country.country, country.grade])).toStrictEqual(
        recomputed.map((country) => [country.country, country.grade]),
      );
    }
  });

  it("除外された求人には必ず理由がある", () => {
    for (const id of CACHED_PERSONA_IDS) {
      for (const excluded of lookupCachedPassport(id)?.excludedJobs ?? []) {
        expect(excluded.reasonJa.length).toBeGreaterThan(0);
      }
    }
  });

  it("スポンサー不要ビザの有無が除外件数に反映されている", () => {
    // 佐藤は3カ国すべてでスポンサー必須ビザしか通らないので、各国1件ずつ除外される。
    expect(lookupCachedPassport("sato-takumi")?.excludedJobs.length).toBe(3);
    // 鈴木と高橋は417が通るのでAUのスポンサー不可求人が対象に残り、除外は2件。
    expect(lookupCachedPassport("suzuki-haruka")?.excludedJobs.length).toBe(2);
    expect(lookupCachedPassport("takahashi-kenta")?.excludedJobs.length).toBe(2);
  });
});
