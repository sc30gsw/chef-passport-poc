import { PassportDashboard } from "~/features/passport/components/passport-dashboard";
import { PipelineTimeline } from "~/features/passport/components/pipeline-timeline";
import { usePipelineReplay } from "~/features/passport/hooks/use-pipeline-replay";
import type { PassportView } from "~/features/passport/utils/join-passport-view";

/**
 * The default screen 2 → 3 sequence: the committed cache, already loaded by the route, replayed in
 * the browser from the durations the generator actually measured. No key, no network, no spend —
 * which is exactly why it is the default and the fallback.
 */
export function CachedPassport({ view }: Record<"view", PassportView>) {
  const { completedCount, isComplete } = usePipelineReplay({ timings: view.timings });

  return isComplete ? (
    <PassportDashboard view={view} />
  ) : (
    <PipelineTimeline completedCount={completedCount} timings={view.timings} />
  );
}
