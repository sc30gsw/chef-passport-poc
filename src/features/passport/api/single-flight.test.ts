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

  it("自由入力の「全体で1本」もこの factory で表せる", () => {
    // #9 が使う形。キーを固定した1スロットが、そのままグローバル単一実行になる。
    const guard = createSingleFlight(1);

    expect(guard.acquire("free-input")).toBe(true);
    expect(guard.acquire("free-input")).toBe(false);
  });
});
