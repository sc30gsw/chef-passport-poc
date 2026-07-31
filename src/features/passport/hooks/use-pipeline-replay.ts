import { useEffect, useState } from "react";

import type { StepTiming } from "~/data/schemas";
import { clampReplayMs } from "~/features/passport/utils/replay-pacing";

/** Progress and the run it describes, in one value — see the note on the identity guard below. */
type ReplayRun = {
  readonly steps: number;
  readonly timings: readonly StepTiming[];
};

/**
 * Client-side replay of the pipeline timeline, driven by the durations the generator actually
 * measured. This is the fallback the plan calls for from the start: if streaming fails in
 * production the client already holds the cached result and can replay it locally.
 *
 * The timings are real recorded values, only clamped — which is what makes it honest to describe on
 * stage as the measured time rather than a decorative progress bar.
 *
 * Two invariants, both learned the hard way in #21:
 *
 * 1. Progress is stored *with* the timings it belongs to. Held apart, a new run inherits the old
 *    run's count for one frame, and `CachedPassport` renders the finished dashboard before
 *    collapsing back to the progress list. `usePipelineStream` adjusts state during render for the
 *    same reason; the two hooks now have the same shape.
 * 2. It replays `timings`, not `STEP_ORDER`. The server-side replay in `api/pipeline-service.ts`
 *    emits only the steps the cache recorded, so padding the missing ones here would make the same
 *    cache take a different length depending on which path replayed it.
 */
export function usePipelineReplay({ timings }: Record<"timings", readonly StepTiming[]>) {
  const [run, setRun] = useState<ReplayRun>(() => ({ steps: 0, timings }));

  // Adjusted during render rather than in an effect, so no frame can show the previous run's
  // progress. https://react.dev/learn/you-might-not-need-an-effect
  if (run.timings !== timings) setRun({ steps: 0, timings });

  useEffect(() => {
    const handles: ReturnType<typeof setTimeout>[] = [];
    let elapsedMs = 0;

    timings.forEach((timing, index) => {
      elapsedMs += clampReplayMs(timing.durationMs);
      handles.push(setTimeout(() => setRun({ steps: index + 1, timings }), elapsedMs));
    });

    // Declared before the loop and returned unconditionally, so no code path can leave this
    // effect with a timer un-cleared.
    return () => {
      for (const handle of handles) clearTimeout(handle);
    };
  }, [timings]);

  // Reads 0 on the render that discovers a new run, before the adjustment above has been applied.
  const completedCount = run.timings === timings ? run.steps : 0;

  return {
    completedCount,
    // Nothing recorded means nothing to replay, so the dashboard shows straight away.
    isComplete: completedCount >= timings.length,
  };
}
