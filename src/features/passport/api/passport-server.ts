import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { loadPassportView } from "~/features/passport/api/passport-view";
import { passportPipelineFromCache } from "~/lib/runtime";

const PassportRequest = Schema.Struct({
  personaId: Schema.String,
});

/**
 * The boundary, and nothing else. Everything this handler references is dropped from the client
 * build along with the handler itself, which is what keeps the committed cache and the gateway
 * client server-side. See .claude/rules/web/tanstack-start.md. The four static fixtures are the
 * deliberate exception: the route loaders decode them isomorphically so a client-side navigation
 * needs no round trip, which is why `~/data/loaders` is the one data module the browser does get.
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
