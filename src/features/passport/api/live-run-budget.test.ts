import { describe, expect, it } from "vite-plus/test";

import { createRunBudget } from "~/features/passport/api/live-run-budget";

/**
 * The single-flight guard bounds how many live runs happen *at once*; this bounds how many happen
 * *at all*. One live run is ~17 gateway calls, so serial repetition is the expensive failure, and
 * concurrency alone never sees it. See audit #16 finding 1.
 */
function fakeClock(startMs = 0) {
  const clock = {
    advance(ms: number) {
      clock.nowMs += ms;
    },
    nowMs: startMs,
  };

  return clock;
}

describe("createRunBudget", () => {
  it("バースト分までは連続で通す", () => {
    const budget = createRunBudget({ burst: 3, refillIntervalMs: 60_000 });

    expect([budget.tryConsume(), budget.tryConsume(), budget.tryConsume()]).toStrictEqual([
      true,
      true,
      true,
    ]);
  });

  it("使い切ったら拒否する。待たせるのではなく断る", () => {
    const budget = createRunBudget({ burst: 1, refillIntervalMs: 60_000 });

    budget.tryConsume();

    expect(budget.tryConsume()).toBe(false);
    expect(budget.remaining()).toBe(0);
  });

  it("時間が経てば1件ずつ回復する", () => {
    const clock = fakeClock();
    const budget = createRunBudget({
      burst: 2,
      now: () => clock.nowMs,
      refillIntervalMs: 60_000,
    });

    budget.tryConsume();
    budget.tryConsume();
    expect(budget.tryConsume()).toBe(false);

    clock.advance(60_000);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
  });

  it("放置してもバーストを超えて貯まらない", () => {
    const clock = fakeClock();
    const budget = createRunBudget({
      burst: 2,
      now: () => clock.nowMs,
      refillIntervalMs: 60_000,
    });

    clock.advance(60_000 * 100);

    expect(budget.remaining()).toBe(2);
  });

  it("回復の端数は切り捨てず持ち越す（半分の間隔を2回で1件）", () => {
    const clock = fakeClock();
    const budget = createRunBudget({
      burst: 1,
      now: () => clock.nowMs,
      refillIntervalMs: 60_000,
    });

    budget.tryConsume();
    clock.advance(30_000);
    expect(budget.remaining()).toBe(0);

    clock.advance(30_000);

    expect(budget.remaining()).toBe(1);
  });
});
