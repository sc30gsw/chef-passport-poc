import { Schema } from "effect";

/**
 * `?live=true` is where the demo's mode lives — on **both** screens. It was a `useState` on `/` and
 * a search param on `/passport/$personaId`, so the switch reset itself the moment the interviewer
 * pressed Back from a live run (#21). One fact, one home, and the URL is the home that survives a
 * reload and a shared link.
 *
 * `live` stays optional rather than defaulted, so a link to a screen that does not care about the
 * mode (`← シェフ選択に戻る`) does not have to name it, and an off toggle leaves the URL clean.
 * TanStack parses the value for us, but a hand-typed URL can still deliver the string, so both are
 * decoded.
 */
const LiveSearch = Schema.Struct({
  live: Schema.optional(
    Schema.transform(Schema.Union(Schema.Boolean, Schema.String), Schema.Boolean, {
      decode: (raw) => raw === true || raw === "true",
      encode: (live) => live,
    }),
  ),
});

export const decodeLiveSearch = Schema.decodeUnknownSync(LiveSearch);
