/**
 * Concurrency guard for live generation, server-side. A live run is a paid API call triggered from
 * a public URL, so a second request for something already running is **refused**, never queued —
 * queueing would multiply the spend for the same click.
 *
 * Closed decision #6 sets the shape: presets get one slot per `personaId` and at most three at
 * once (there are exactly three presets); free input gets a single global slot, which is this same
 * factory built with one slot and a constant key.
 *
 * A mutable registry is the point rather than a lapse: this is process state being observed, not a
 * value being transformed, so the repo's "return new values" rule has nothing to act on here.
 */
/**
 * A slot cannot outlive the run it belongs to. `release` sits in the `finally` of an async
 * generator, and a client that disconnects mid-stream may leave the runtime never calling
 * `.return()` on it — the `finally` never runs and the slot is held for the life of the process.
 * For free input that is the *global* slot: one abandoned request would disable the feature until
 * the instance recycles. The expiry equals the pipeline's own 120-second total budget (closed
 * decision #6), so no live run can still be going when its slot expires. See audit #16 finding 4.
 */
const SLOT_TTL_MS = 120_000;

export type SingleFlightOptions = {
  /** Injectable clock. Tests drive time rather than waiting for it. */
  readonly now?: () => number;
  readonly ttlMs?: number;
};

export function createSingleFlight(maxConcurrent: number, options: SingleFlightOptions = {}) {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? SLOT_TTL_MS;
  const acquiredAt = new Map<string, number>();

  function dropExpired() {
    const at = now();

    for (const [key, since] of acquiredAt) {
      if (at - since >= ttlMs) acquiredAt.delete(key);
    }
  }

  return {
    /** `false` means a run is already in flight — the caller degrades instead of waiting. */
    acquire(key: string): boolean {
      dropExpired();

      if (acquiredAt.has(key) || acquiredAt.size >= maxConcurrent) return false;

      acquiredAt.set(key, now());
      return true;
    },
    activeCount(): number {
      dropExpired();
      return acquiredAt.size;
    },
    release(key: string): void {
      acquiredAt.delete(key);
    },
  };
}

/** One slot per preset persona, three personas, so three concurrent live runs at most. */
export const presetSingleFlight = createSingleFlight(3);
