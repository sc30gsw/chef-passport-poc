import { describe, expect, it } from "vite-plus/test";

import { decodeCacheSource } from "~/data/cache-index";
import { ChefDataError } from "~/data/loaders";

describe("decodeCacheSource", () => {
  it("スキーマに一致しないキャッシュは ParseError ではなくドメインエラーで落ちる", () => {
    // 監査 #17 finding 16。起動時に大声で落ちるのは正しいが、投げていたのは素の `ParseError`
    // で、`__root.tsx` の errorComponent がその英語ダンプを日本語のデモ画面に出していた。
    expect(() => decodeCacheSource("sato-takumi", { personaId: 42 })).toThrow(ChefDataError);
  });

  it("落ちるときはどのファイルが壊れているか日本語で名指しする", () => {
    try {
      decodeCacheSource("suzuki-haruka", {});
      expect.unreachable("壊れたキャッシュがデコードできてはならない");
    } catch (error) {
      expect(error).toBeInstanceOf(ChefDataError);
      expect((error as ChefDataError).message).toContain("suzuki-haruka.json");
      // 元の `ParseError` は捨てずに `cause` に残す — 直すのは開発者なので詳細は要る。
      expect((error as ChefDataError).cause).toBeDefined();
    }
  });
});
