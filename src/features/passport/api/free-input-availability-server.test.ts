import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { readFreeInputAvailability } from "~/features/passport/api/free-input-availability-server";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * The one server function that had no test, because its body was inlined in the route file and
 * therefore unimportable (audit #17 finding 13). What it must never do is leak the key itself: the
 * page is told whether live generation is possible, which is a boolean.
 */
describe("readFreeInputAvailability", () => {
  it("キーがあれば自由入力を受け付ける", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "vck_test");

    expect(readFreeInputAvailability()).toEqual({ available: true });
  });

  it("キーが無ければ受け付けない", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", undefined);

    expect(readFreeInputAvailability()).toEqual({ available: false });
  });

  it("返すのは真偽値だけで、キーそのものは決して含まない", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "vck_secret_value");

    const payload = readFreeInputAvailability();

    expect(Object.keys(payload)).toEqual(["available"]);
    expect(JSON.stringify(payload)).not.toContain("vck_secret_value");
  });
});
