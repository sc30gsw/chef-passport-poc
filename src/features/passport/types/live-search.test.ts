import { describe, expect, it } from "vite-plus/test";

import { decodeLiveSearch } from "~/features/passport/types/live-search";

describe("decodeLiveSearch", () => {
  it("パラメータが無ければ live は未指定のまま（既定はキャッシュ再生）", () => {
    expect(decodeLiveSearch({})).toEqual({});
  });

  it("手打ちURLの文字列 true も真として読む", () => {
    expect(decodeLiveSearch({ live: "true" })).toEqual({ live: true });
  });

  it("真偽値でもそのまま読む", () => {
    expect(decodeLiveSearch({ live: true })).toEqual({ live: true });
  });

  it.each(["false", "1", "yes"])("%s は真にしない", (raw) => {
    expect(decodeLiveSearch({ live: raw })).toEqual({ live: false });
  });

  it.each([{ live: ["true"] }, { live: 1 }, { live: null }])(
    "スキーマ外の値 %o は ParseError を投げずに未指定へ落とす",
    (search) => {
      // 監査 #17 finding 17。壊れたURLは「読み込みに失敗しました」ではなく既定モードで開く。
      // ParseError の英語ダンプが日本語のデモ画面に出るのが、この経路の唯一の失敗の形だった。
      expect(decodeLiveSearch(search)).toEqual({});
    },
  );

  it("両画面が同じデコーダを共有する（トグルの状態が1か所にしかない証拠）", () => {
    // `/` と `/passport/$personaId` が別々のスキーマを持っていたのが #21 の finding 8。
    expect(decodeLiveSearch({ live: "true" })).toEqual(decodeLiveSearch({ live: true }));
  });
});
