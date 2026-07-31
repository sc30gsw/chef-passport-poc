import { Schema } from "effect";

/**
 * The streaming server function's whole input. It lives apart from the server function so the
 * boundary module can validate with it while the handler body — which pulls in the pipeline, the
 * data loaders and the gateway client — stays out of the client build.
 * See .claude/rules/web/tanstack-start.md.
 *
 * `live` is a **request, not a decision**. The server decides whether the run actually reaches the
 * gateway, from the presence of `AI_GATEWAY_API_KEY` and the single-flight registry, and reports
 * every downgrade back through `PipelineDegradation`.
 */
export const PassportStreamRequest = Schema.Struct({
  live: Schema.Boolean,
  personaId: Schema.String,
});
export type PassportStreamRequest = Schema.Schema.Type<typeof PassportStreamRequest>;
