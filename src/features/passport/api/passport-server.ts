import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { loadPassportView } from "~/features/passport/api/passport-view";
import { passportPipelineFromCache } from "~/lib/runtime";

const PassportRequest = Schema.Struct({
  personaId: Schema.String,
});

/**
 * The route/loader contract. Components keep importing `PassportView` from here; the type is a pure
 * re-export, erased at compile time, so it costs the browser nothing.
 */
export type { PassportView } from "~/features/passport/api/passport-view";

/**
 * The boundary, and nothing else. Everything this handler references is dropped from the client
 * build along with the handler itself, which is what keeps the committed cache, the data loaders and
 * the gateway client server-side. See .claude/rules/web/tanstack-start.md.
 *
 * The composition point is consulted here and nowhere else in the request path. The cache Layer is
 * taken unpaced: the recorded timings travel with the result and `usePipelineReplay` paces them in
 * the browser, so pacing here too would stall the navigation and then replay it a second time.
 */
export const loadPassportServer = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => Schema.decodeUnknownSync(PassportRequest)(data))
  .handler(({ data }) =>
    loadPassportView(data.personaId, passportPipelineFromCache({ paced: false })),
  );
