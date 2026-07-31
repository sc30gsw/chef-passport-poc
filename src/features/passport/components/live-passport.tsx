import { Alert, Stack } from "@mantine/core";

import type { Job, VisaRequirement } from "~/data/schemas";
import { generatePassportServer } from "~/features/passport/api/generate-passport-server";
import { PassportDashboard } from "~/features/passport/components/passport-dashboard";
import { PipelineTimeline } from "~/features/passport/components/pipeline-timeline";
import { usePipelineStream } from "~/features/passport/hooks/use-pipeline-stream";
import type { PassportView } from "~/features/passport/utils/join-passport-view";
import { joinPassportView } from "~/features/passport/utils/join-passport-view";

/**
 * Live generation, driven by the events the server function streams back. `fallbackView` is the
 * cached run the route loader already produced: the server's own fallback covers a failed model, and
 * this covers the cases the server cannot report on — the request never arriving, and a chunk that
 * arrives but does not decode.
 *
 * `jobs` and `visas` arrive as props rather than being decoded in the render body. The route loader
 * is the composition layer that owns loading them, which is also what lets this component render in
 * a test without the data layer behind it.
 */
const TRANSPORT_FAILURE_JA = "ライブ生成に接続できませんでした。事前生成キャッシュを表示します。";

/**
 * A chunk that will not decode is a contract bug between the server's encoder and the client's
 * schema, not a connection problem. Saying "接続できませんでした" for it would point at the network
 * while the wire is fine.
 */
const DECODE_FAILURE_JA =
  "サーバーから届いた進行イベントを解釈できませんでした（形式の不一致）。事前生成キャッシュを表示します。";

/** Module-level so its identity is stable: the hook keys its effect on `open` and the request. */
function openPresetStream(personaId: string) {
  return generatePassportServer({ data: { live: true, personaId } });
}

type LivePassportProps = {
  fallbackView: PassportView;
  jobs: readonly Job[];
  visas: readonly VisaRequirement[];
};

export function LivePassport({ fallbackView, jobs, visas }: LivePassportProps) {
  const { completedCount, degraded, failureJa, isComplete, result, timings } = usePipelineStream({
    decodeFailureJa: DECODE_FAILURE_JA,
    open: openPresetStream,
    request: fallbackView.persona.id,
    transportFailureJa: TRANSPORT_FAILURE_JA,
  });

  if (failureJa === undefined && !isComplete) {
    return <PipelineTimeline completedCount={completedCount} timings={timings} />;
  }

  const view =
    result === undefined
      ? fallbackView
      : joinPassportView({
          jobs,
          persona: fallbackView.persona,
          result,
          visas,
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
