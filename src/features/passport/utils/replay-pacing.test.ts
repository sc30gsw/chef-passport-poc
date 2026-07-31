import { describe, expect, it } from "vite-plus/test";

import { clampReplayMs } from "~/features/passport/utils/replay-pacing";

describe("clampReplayMs", () => {
  it.each([
    [0, 800],
    [500, 800],
    [1500, 1500],
    [9000, 2500],
  ])("実測 %i ms は %i ms に丸められる", (measured, expected) => {
    expect(clampReplayMs(measured)).toBe(expected);
  });
});
