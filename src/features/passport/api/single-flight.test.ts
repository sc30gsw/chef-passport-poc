import { describe, expect, it } from "vite-plus/test";

import { createSingleFlight } from "~/features/passport/api/single-flight";

describe("createSingleFlight", () => {
  it("同じキーの2本目は拒否する（待たせない）", () => {
    const guard = createSingleFlight(3);

    expect(guard.acquire("sato-takumi")).toBe(true);
    expect(guard.acquire("sato-takumi")).toBe(false);
  });

  it("キーが違えば上限まで同時に取れる", () => {
    const guard = createSingleFlight(3);

    expect(["sato-takumi", "suzuki-haruka", "takahashi-kenta"].map(guard.acquire)).toStrictEqual([
      true,
      true,
      true,
    ]);
    expect(guard.activeCount()).toBe(3);
  });

  it("上限に達したら未使用のキーでも拒否する", () => {
    const guard = createSingleFlight(2);

    guard.acquire("a");
    guard.acquire("b");

    expect(guard.acquire("c")).toBe(false);
  });

  it("解放したスロットは再利用できる", () => {
    const guard = createSingleFlight(1);

    guard.acquire("a");
    guard.release("a");

    expect(guard.acquire("a")).toBe(true);
    expect(guard.activeCount()).toBe(1);
  });

  it("放棄されたスロットは期限切れで再利用できる", () => {
    // 切断されたストリームでは async generator の finally が走らないことがあり、release が呼ばれ
    // ないままスロットが残る。期限がなければ、そのプロセスでは以後ずっとライブ生成が塞がれる。
    let nowMs = 0;
    const guard = createSingleFlight(1, { now: () => nowMs, ttlMs: 1_000 });

    expect(guard.acquire("a")).toBe(true);
    expect(guard.acquire("a")).toBe(false);

    nowMs = 1_000;

    expect(guard.acquire("a")).toBe(true);
  });

  it("期限内のスロットは占有したままにする", () => {
    let nowMs = 0;
    const guard = createSingleFlight(1, { now: () => nowMs, ttlMs: 1_000 });

    guard.acquire("a");
    nowMs = 999;

    expect(guard.acquire("a")).toBe(false);
    expect(guard.activeCount()).toBe(1);
  });

  it("自由入力の「全体で1本」もこの factory で表せる", () => {
    // #9 が使う形。キーを固定した1スロットが、そのままグローバル単一実行になる。
    const guard = createSingleFlight(1);

    expect(guard.acquire("free-input")).toBe(true);
    expect(guard.acquire("free-input")).toBe(false);
  });
});
