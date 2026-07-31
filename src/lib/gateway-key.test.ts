import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { hasGatewayKey } from "~/lib/gateway-key";

/**
 * This one predicate is the whole live/cache gate. Its failure mode is not an attacker but a deploy
 * that sets the variable to something blank: the gate opens, every live path calls the gateway, and
 * the answer comes back as a 401 instead of the clean "no key set" the cache path already handles.
 * See audit #16 finding 5.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasGatewayKey", () => {
  it("キーがあれば true", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "vck_test");

    expect(hasGatewayKey()).toBe(true);
  });

  it.each([
    ["未設定", undefined],
    ["空文字", ""],
    ["空白のみ", "   "],
    ["改行のみ", "\n"],
    ["タブのみ", "\t"],
  ])("%s は「キーなし」として扱う", (_label, value) => {
    vi.stubEnv("AI_GATEWAY_API_KEY", value);

    expect(hasGatewayKey()).toBe(false);
  });
});
