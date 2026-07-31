import { createServerFn } from "@tanstack/react-start";

import { hasGatewayKey } from "~/lib/gateway-key";

/**
 * Key presence is read on the server, inside the handler — never at module scope, and never with a
 * `VITE_` prefix, which would ship the key itself to the browser. The page learns only whether live
 * generation is possible, which is a boolean, not a secret.
 *
 * There is no feature flag: `ENABLE_FREE_INPUT` was abolished by the owner on 2026-07-30 in favour
 * of gating on `AI_GATEWAY_API_KEY` alone. See .claude/rules/common/security.md.
 *
 * The body lives here rather than inside the `createServerFn` wrapper, and this module lives beside
 * the other three server functions rather than inside `routes/free.tsx`, for the reason the other
 * three already do: the wrapper is unimportable under Vitest, so an inlined body is untestable.
 * See .claude/rules/web/tanstack-start.md and audit #17 finding 13. It takes no input, so there is
 * nothing for an `.inputValidator` to decode.
 */
export function readFreeInputAvailability() {
  return { available: hasGatewayKey() };
}

export const readFreeInputAvailabilityServer = createServerFn({ method: "GET" }).handler(() =>
  readFreeInputAvailability(),
);
