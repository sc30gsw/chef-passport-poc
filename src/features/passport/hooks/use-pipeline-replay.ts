import { useEffect, useState } from "react";

import type { StepTiming } from "~/data/schemas";
import { STEP_ORDER } from "~/features/passport/types/pipeline-event";

/** Same bounds the server-side replay uses, so both paths pace identically. */
const MIN_REPLAY_MS = 800;
const MAX_REPLAY_MS = 2500;

function clampReplayMs(durationMs: number): number {
  return Math.min(MAX_REPLAY_MS, Math.max(MIN_REPLAY_MS, durationMs));
}

/**
 * Client-side replay of the pipeline timeline, driven by the durations the generator actually
 * measured. This is the fallback the plan calls for from the start: if streaming fails in
 * production the client already holds the cached result and can replay it locally.
 *
 * The timings are real recorded values, only clamped — which is what makes it honest to describe on
 * stage as the measured time rather than a decorative progress bar.
 *
 * The effect only *schedules*; it never sets state synchronously. The no-timings case is derived
 * during render instead, so there is no frame where the user sees a stale value.
 */
export function usePipelineReplay({ timings }: Record<"timings", readonly StepTiming[]>) {
  const [elapsedSteps, setElapsedSteps] = useState(0);

  useEffect(() => {
    if (timings.length === 0) return;

    const handles: ReturnType<typeof setTimeout>[] = [];
    let elapsedMs = 0;

    STEP_ORDER.forEach((step, index) => {
      const measured = timings.find((timing) => timing.step === step);
      elapsedMs += clampReplayMs(measured?.durationMs ?? 0);
      handles.push(setTimeout(() => setElapsedSteps(index + 1), elapsedMs));
    });

    return () => {
      for (const handle of handles) clearTimeout(handle);
    };
  }, [timings]);

  // Nothing recorded means nothing to replay, so the dashboard shows straight away.
  const completedCount = timings.length === 0 ? STEP_ORDER.length : elapsedSteps;

  return {
    completedCount,
    isComplete: completedCount >= STEP_ORDER.length,
  };
}
