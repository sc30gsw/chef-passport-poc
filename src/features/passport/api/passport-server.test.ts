import { describe, expect, it } from "vite-plus/test";

import { loadPassportServer, loadPassportView } from "~/features/passport/api/passport-server";

describe("loadPassportView", () => {
  it("プリセットのビューを組み立てる", async () => {
    const loaded = await loadPassportView("sato-takumi");

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(loaded.data.persona.name).toBe("佐藤 匠");
    expect(loaded.data.countries.length).toBe(3);
    expect(loaded.data.timings.length).toBe(4);
  });

  it("求人とビザをサーバー側で結合するので、クライアントはIDを引かなくてよい", async () => {
    const loaded = await loadPassportView("sato-takumi");
    if (!loaded.ok) return;

    for (const { job, match } of loaded.data.jobMatches) {
      expect(job.id).toBe(match.jobId);
    }
    for (const country of loaded.data.countries) {
      expect(country.visaRequirements.length).toBe(2);
      expect(country.visaRequirements.every((visa) => visa.country === country.country)).toBe(true);
    }
  });

  it("除外求人も求人本体と理由の組で返す", async () => {
    const loaded = await loadPassportView("sato-takumi");
    if (!loaded.ok) return;

    expect(loaded.data.excludedJobs.length).toBe(3);
    for (const excluded of loaded.data.excludedJobs) {
      expect(excluded.job.sponsorshipAvailable).toBe(false);
      expect(excluded.reasonJa.length).toBeGreaterThan(0);
    }
  });

  it("存在しないペルソナは ok:false と日本語メッセージを返す（例外を投げない）", async () => {
    const loaded = await loadPassportView("nope");

    expect(loaded.ok).toBe(false);
    expect(loaded.ok === false ? loaded.message : "").toContain("nope");
  });

  it("Effect も Exit も境界を越えない", async () => {
    const loaded = await loadPassportView("sato-takumi");

    // JSON として往復できることがサーバー関数の返却値の条件。ここで structuredClone を使うと
    // Date や Map を保持してしまい、まさに検証したい制約が検証できなくなる。
    const wireFormat = JSON.stringify(loaded);

    expect(JSON.parse(wireFormat)).toStrictEqual(loaded);
  });
});

describe("loadPassportServer", () => {
  it("ハンドラを通してビューを返す", async () => {
    const loaded = await loadPassportServer({ data: { personaId: "suzuki-haruka" } });

    expect(loaded.ok).toBe(true);
    expect(loaded.ok ? loaded.data.persona.name : "").toBe("鈴木 遥");
  });

  it("スキーマに合わない入力は inputValidator が弾く", () => {
    // `decodeUnknownSync` なので Promise の reject ではなく同期的に throw する。
    expect(() => loadPassportServer({ data: { personaId: 42 } })).toThrow(/Expected string/);
  });
});
