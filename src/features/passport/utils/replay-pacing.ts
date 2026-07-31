/**
 * Replay bounds, so a slow recorded call cannot stall the demo and a fast one is still visible.
 *
 * One home rather than two copies. The server-side cache replay (`api/pipeline-service.ts`) and the
 * client-side one (`hooks/use-pipeline-replay.ts`) have to pace the *same* cache identically, and
 * until #21 the only thing enforcing that was a comment in each file saying so.
 *
 * It lives in `utils/` rather than in `api/` because the hook may not import the api module: that
 * would pull `@effect/ai` and the whole pipeline graph into the browser bundle for three numbers.
 */
const MIN_REPLAY_MS = 800;
const MAX_REPLAY_MS = 2500;

export function clampReplayMs(durationMs: number): number {
  return Math.min(MAX_REPLAY_MS, Math.max(MIN_REPLAY_MS, durationMs));
}
