import { Alert, Stack } from "@mantine/core";
import { Effect } from "effect";

import { loadJobs, loadVisaRequirements } from "~/data/loaders";
import { PassportDashboard } from "~/features/passport/components/passport-dashboard";
import { PipelineTimeline } from "~/features/passport/components/pipeline-timeline";
import { usePipelineStream } from "~/features/passport/hooks/use-pipeline-stream";
import type { PassportView } from "~/features/passport/utils/join-passport-view";
import { joinPassportView } from "~/features/passport/utils/join-passport-view";

/**
 * Live generation, driven by the events the server function streams back. `fallbackView` is the
 * cached run the route loader already produced: the server's own fallback covers a failed model, and
 * this covers the case the server cannot report on — the request never arriving at all.
 *
 * Jobs and visas are re-joined here from the same bundled JSON the picker already loads, so the
 * streamed `PassportResult` reaches the dashboard through the same join the loader uses.
 */
export function LivePassport({ fallbackView }: Record<"fallbackView", PassportView>) {
  const { completedCount, degraded, failureJa, isComplete, result, timings } = usePipelineStream({
    personaId: fallbackView.persona.id,
  });

  if (failureJa === undefined && !isComplete) {
    return <PipelineTimeline completedCount={completedCount} timings={timings} />;
  }

  const view =
    result === undefined
      ? fallbackView
      : joinPassportView({
          jobs: Effect.runSync(loadJobs),
          persona: fallbackView.persona,
          result,
          visas: Effect.runSync(loadVisaRequirements),
          vocabulary: fallbackView.vocabulary,
        });

  const noticeJa = failureJa ?? degraded?.messageJa;

  return (
    <Stack gap="lg">
      {noticeJa === undefined ? null : (
        <Alert color="yellow" title="ライブ生成ではなくキャッシュ再生です" variant="light">
          {noticeJa}
          <strong>適合判定とスコアは変わりません</strong>
          （判定は決定論、言語化のみLLMという設計のため）。
        </Alert>
      )}
      <PassportDashboard view={view} />
    </Stack>
  );
}
