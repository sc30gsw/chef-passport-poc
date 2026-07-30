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
export function createSingleFlight(maxConcurrent: number) {
  const active = new Set<string>();

  return {
    /** `false` means a run is already in flight — the caller degrades instead of waiting. */
    acquire(key: string): boolean {
      if (active.has(key) || active.size >= maxConcurrent) return false;

      active.add(key);
      return true;
    },
    activeCount(): number {
      return active.size;
    },
    release(key: string): void {
      active.delete(key);
    },
  };
}

/** One slot per preset persona, three personas, so three concurrent live runs at most. */
export const presetSingleFlight = createSingleFlight(3);
