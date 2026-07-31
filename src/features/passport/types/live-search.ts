import { Either, Schema } from "effect";

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

const decode = Schema.decodeUnknownEither(LiveSearch);

/**
 * A hand-mangled URL falls back to the default mode instead of throwing. `decodeUnknownSync` would
 * surface a raw `ParseError` to TanStack's `errorComponent`, which renders `error.message` — the
 * English Effect parse dump in place of the whole screen, over a query string nobody typed on
 * purpose. Cache replay is the safe default and costs nothing, so a bad `?live=` is worth ignoring
 * rather than escalating. See .claude/rules/typescript/effect-schema.md and audit #17 finding 17.
 */
export function decodeLiveSearch(search: Record<string, unknown>) {
  return Either.getOrElse(decode(search), () => ({}) as Schema.Schema.Type<typeof LiveSearch>);
}
