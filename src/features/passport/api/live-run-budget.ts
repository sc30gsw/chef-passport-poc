/**
 * How many live runs this process will start, in aggregate. The single-flight guard next door
 * bounds how many run *at once*; nothing bounded how many run *in a row*, and serial volume is what
 * costs money: one live run is roughly 17 gateway calls (1 extract + 1 translate + 3 country
 * explanations + 12 job explanations) and up to ~51 once `Effect.retry` is counted. A public URL
 * with no auth turns a `for` loop into a bill. See audit #16 finding 1.
 *
 * A token bucket rather than a fixed window: a demo is bursty — three personas clicked in a row is
 * normal use — so the shape has to allow a burst and then throttle, not refuse the fourth click of
 * the minute and forgive everything at the top of the next one.
 *
 * **Per-instance, and deliberately so.** This is module state, so on Vercel Fluid each instance
 * carries its own bucket and N instances multiply the bound by N. Bounding a fleet needs shared
 * state this PoC has no store for; the aggregate backstop is the per-key spend ceiling in the AI
 * Gateway dashboard (owner-confirmed 2026-07-30), which is the only limit that is genuinely global.
 * Recorded in .claude/rules/common/security.md so nobody reads this bucket as more than it is.
 *
 * A mutable counter is the point rather than a lapse: this is process state being observed over
 * time, not a value being transformed, so the repo's "return new values" rule has nothing to act on.
 */
export type RunBudgetOptions = {
  /** Runs allowed back-to-back from a full bucket. */
  readonly burst: number;
  /** Injectable clock. Tests drive time rather than waiting for it. */
  readonly now?: () => number;
  /** One token returns per this interval, so this is the sustained rate. */
  readonly refillIntervalMs: number;
};

export type RunBudget = {
  readonly remaining: () => number;
  /** `false` means refused — the caller degrades or refuses, and never queues. */
  readonly tryConsume: () => boolean;
};

export function createRunBudget(options: RunBudgetOptions): RunBudget {
  const now = options.now ?? Date.now;
  let tokens = options.burst;
  let lastRefillAt = now();

  /**
   * Advances `lastRefillAt` by whole intervals only. Dropping the remainder instead would let a
   * caller poll every half-interval and never earn a token at all.
   */
  function refill() {
    const earned = Math.floor((now() - lastRefillAt) / options.refillIntervalMs);

    if (earned <= 0) return;

    tokens = Math.min(options.burst, tokens + earned);
    lastRefillAt += earned * options.refillIntervalMs;
  }

  return {
    remaining() {
      refill();
      return tokens;
    },
    tryConsume() {
      refill();

      if (tokens <= 0) return false;

      tokens -= 1;
      return true;
    },
  };
}

/**
 * Six back-to-back live runs — the three preset personas plus a few free-input tries — then one a
 * minute. Sized against the demo it has to survive, not against a threat model: at ~17 calls a run
 * a full bucket is ~100 gateway calls, and the sustained rate is ~17 a minute per instance.
 */
const LIVE_RUN_BURST = 6;
const LIVE_RUN_REFILL_MS = 60_000;

/**
 * The one bucket both live paths draw from — preset live generation and free input alike. Two
 * buckets would bound each path and neither the spend, which is the thing being bounded.
 */
export const liveRunBudget = createRunBudget({
  burst: LIVE_RUN_BURST,
  refillIntervalMs: LIVE_RUN_REFILL_MS,
});
