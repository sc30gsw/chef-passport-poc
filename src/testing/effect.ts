import { Effect } from "effect";
import { it } from "vite-plus/test";

/**
 * `@effect/vitest` is unusable in this repo: its peer is `vitest ^3.2.0` while Vite+ 0.2.1
 * bundles 4.1.9, and installing `vitest` directly is forbidden. This is the whole replacement.
 */
export function itEffect(name: string, self: Effect.Effect<unknown, unknown, never>) {
  it(name, () => Effect.runPromise(self as Effect.Effect<unknown>));
}
