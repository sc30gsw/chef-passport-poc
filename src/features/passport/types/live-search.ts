import * as v from "valibot";

/**
 * `?live=true` is where the demo's mode lives — on **both** screens. It was a `useState` on `/` and
 * a search param on `/passports/$personalId`, so the switch reset itself the moment the interviewer
 * pressed Back from a live run (#21). One fact, one home, and the URL is the home that survives a
 * reload and a shared link.
 *
 * Default is `false` (cache replay). `stripSearchParams` drops that default from the URL so an off
 * toggle stays clean. TanStack may hand us the string `"true"` from a typed URL, so both boolean
 * and string are accepted; anything else falls back instead of blanking the screen with a parse dump
 * (audit #17 finding 17).
 */
export const defaultLiveSearchParams = {
  live: false,
} as const satisfies Record<string, boolean>;

const liveFlag = v.fallback(
  v.pipe(
    v.union([v.boolean(), v.string()]),
    v.transform((raw) => raw === true || raw === "true"),
  ),
  defaultLiveSearchParams.live,
);

export const liveSearchSchema = v.object({
  live: v.optional(liveFlag, defaultLiveSearchParams.live),
});
