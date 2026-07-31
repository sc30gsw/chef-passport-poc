import type { PassportResult, StepTiming } from "~/data/schemas";
import type { PipelineDegradation, PipelineEvent } from "~/features/passport/types/pipeline-event";
import { STEP_ORDER } from "~/features/passport/types/pipeline-event";

/**
 * What a run looks like to the screen, from either source. `usePipelineReplay` (cached) and
 * `usePipelineStream` (live) both produce this shape, which is how `PipelineTimeline` renders one
 * contract without ever branching on where the events came from.
 */
export type PipelineRunState = {
  readonly completedCount: number;
  readonly degraded: PipelineDegradation | undefined;
  readonly failureJa: string | undefined;
  readonly isComplete: boolean;
  readonly result: PassportResult | undefined;
  readonly timings: readonly StepTiming[];
};

const INITIAL: PipelineRunState = {
  completedCount: 0,
  degraded: undefined,
  failureJa: undefined,
  isComplete: false,
  result: undefined,
  timings: [],
};

/**
 * Folds the events into that shape. One rule is not a plain accumulation: a `StepStarted` for the
 * first step means a run is *beginning*, so everything accumulated before it is dropped.
 *
 * That is what makes the server-side fallback legible without a source-specific branch — when live
 * generation fails, the server replays the cache from step 1, and the timeline visibly restarts
 * instead of resuming half-way through with durations from a run that no longer exists.
 */
export function derivePipelineRunState(events: readonly PipelineEvent[]): PipelineRunState {
  return events.reduce<PipelineRunState>((state, event) => {
    switch (event._tag) {
      case "StepStarted":
        return event.step === STEP_ORDER[0] ? INITIAL : state;

      case "StepCompleted":
        return {
          ...state,
          completedCount: state.completedCount + 1,
          timings: [...state.timings, { durationMs: event.durationMs, step: event.step }],
        };

      case "Completed":
        return {
          ...state,
          completedCount: STEP_ORDER.length,
          degraded: event.degraded,
          isComplete: true,
          result: event.result,
          timings: state.timings.length > 0 ? state.timings : event.result.timings,
        };

      case "Failed":
        return { ...state, failureJa: event.messageJa };
    }
  }, INITIAL);
}
