import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";

import { liveSearchSchema } from "~/features/passport/types/live-search";

describe("liveSearchSchema", () => {
  it("パラメータが無ければ live は false（既定はキャッシュ再生）", () => {
    expect(v.parse(liveSearchSchema, {})).toEqual({ live: false });
  });

  it("手打ちURLの文字列 true も真として読む", () => {
    expect(v.parse(liveSearchSchema, { live: "true" })).toEqual({ live: true });
  });

  it("真偽値でもそのまま読む", () => {
    expect(v.parse(liveSearchSchema, { live: true })).toEqual({ live: true });
  });

  it.each(["false", "1", "yes"])("%s は真にしない", (raw) => {
    expect(v.parse(liveSearchSchema, { live: raw })).toEqual({ live: false });
  });

  it.each([{ live: ["true"] }, { live: 1 }, { live: null }])(
    "スキーマ外の値 %o は ParseError を投げずに既定へ落とす",
    (search) => {
      // 監査 #17 finding 17。壊れたURLは「読み込みに失敗しました」ではなく既定モードで開く。
      expect(v.parse(liveSearchSchema, search)).toEqual({ live: false });
    },
  );

  it("両画面が同じスキーマを共有する（トグルの状態が1か所にしかない証拠）", () => {
    // `/` と `/passports/$personalId` が別々のスキーマを持っていたのが #21 の finding 8。
    expect(v.parse(liveSearchSchema, { live: "true" })).toEqual(
      v.parse(liveSearchSchema, { live: true }),
    );
  });
});
