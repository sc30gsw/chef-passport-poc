import { describe, expect, it } from "vite-plus/test";

import { loadPassportServer } from "~/features/passport/api/passport-server";
import { loadPassportView } from "~/features/passport/api/passport-view";
import { pipelineFromCache } from "~/features/passport/api/pipeline-service";
import { passportPipelineFromCache } from "~/lib/runtime";

/** The Layer the server function itself supplies, so these tests exercise the real request path. */
const preset = passportPipelineFromCache({ paced: false });

describe("loadPassportView", () => {
  it("プリセットのビューを組み立てる", async () => {
    const loaded = await loadPassportView("sato-takumi", preset);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(loaded.data.persona.name).toBe("佐藤 匠");
    expect(loaded.data.countries.length).toBe(3);
    expect(loaded.data.timings.length).toBe(4);
  });

  it("求人とビザをサーバー側で結合するので、クライアントはIDを引かなくてよい", async () => {
    const loaded = await loadPassportView("sato-takumi", preset);
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
    const loaded = await loadPassportView("sato-takumi", preset);
    if (!loaded.ok) return;

    expect(loaded.data.excludedJobs.length).toBe(3);
    for (const excluded of loaded.data.excludedJobs) {
      expect(excluded.job.sponsorshipAvailable).toBe(false);
      expect(excluded.reasonJa.length).toBeGreaterThan(0);
    }
  });

  it("存在しないペルソナは ok:false と日本語メッセージを返す（例外を投げない）", async () => {
    const loaded = await loadPassportView("nope", preset);

    expect(loaded.ok).toBe(false);
    expect(loaded.ok === false ? loaded.message : "").toContain("nope");
  });

  it("結果は渡した Layer が決める。失敗する Layer なら ok:false になる", async () => {
    // ローダーがキャッシュを自前で引かず、タグ越しに結果を受け取っている証拠。実装が
    // `lookupCachedPassport` に戻れば、この Layer を渡しても成功してしまいテストが落ちる。
    const loaded = await loadPassportView(
      "sato-takumi",
      pipelineFromCache(() => undefined),
    );

    expect(loaded.ok).toBe(false);
    expect(loaded.ok === false ? loaded.message : "").toContain("事前生成結果が見つかりません");
  });

  it("Effect も Exit も境界を越えない", async () => {
    const loaded = await loadPassportView("sato-takumi", preset);

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

  it("ハンドラは再生ペーシングを待たない（再生はクライアント側の仕事）", async () => {
    const startedAt = performance.now();
    await loadPassportServer({ data: { personaId: "sato-takumi" } });
    const measured = performance.now() - startedAt;

    // ペーシングありのキャッシュ Layer を選んでいたら 4ステップ × 下限800ms で 3.2秒かかる。
    expect(measured).toBeLessThan(2000);
  });

  it("スキーマに合わない入力は inputValidator が弾く", () => {
    // `decodeUnknownSync` なので Promise の reject ではなく同期的に throw する。
    expect(() => loadPassportServer({ data: { personaId: 42 } })).toThrow(/Expected string/);
  });
});
