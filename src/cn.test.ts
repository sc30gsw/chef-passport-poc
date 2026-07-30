import { cn } from "cnfast";
import { describe, expect, it } from "vite-plus/test";

describe("cn", () => {
  it("後勝ちで Tailwind の競合クラスを解決する", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});
