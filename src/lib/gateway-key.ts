/**
 * The whole live/cache gate, in one place. There is no feature flag: the owner abolished
 * `ENABLE_FREE_INPUT` on 2026-07-30 in favour of gating on the key alone, so a deploy with no key
 * is cache-only by construction rather than by remembering to leave a flag off.
 * See .claude/rules/common/security.md.
 *
 * Read from `process.env` at call time, never at module scope — module scope is evaluated during
 * bundling, and every caller invokes this from inside a server-function handler.
 *
 * One implementation on purpose: preset streaming, free input and the `/free` page all ask the same
 * question, and two copies of it would eventually answer differently.
 */
export function hasGatewayKey(): boolean {
  const apiKey = process.env.AI_GATEWAY_API_KEY;

  return apiKey !== undefined && apiKey.length > 0;
}
