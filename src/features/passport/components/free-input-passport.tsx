import { Alert, Code, Stack, Text } from "@mantine/core";
import { useState } from "react";

import type { Job, SkillVocabularyEntry, VisaRequirement } from "~/data/schemas";
import { personaFromFreeInput } from "~/features/passport/api/build-passport";
import { generateFreePassportServer } from "~/features/passport/api/free-input-server";
import { FreeInputForm } from "~/features/passport/components/free-input-form";
import { PassportDashboard } from "~/features/passport/components/passport-dashboard";
import { PipelineTimeline } from "~/features/passport/components/pipeline-timeline";
import { usePipelineStream } from "~/features/passport/hooks/use-pipeline-stream";
import type { FreeInputRequest } from "~/features/passport/types/free-input-request";
import { joinPassportView } from "~/features/passport/utils/join-passport-view";

/**
 * Free input has no committed cache to fall back on, so this sentence has to be different from the
 * preset one: there is nothing to show instead, only something to try again.
 */
const TRANSPORT_FAILURE_JA =
  "ライブ生成に接続できませんでした。自由入力には事前生成キャッシュという退避先がないため、時間をおいて再度お試しください。";

/** Same distinction the preset screen makes: schema drift is not a connection problem. */
const DECODE_FAILURE_JA =
  "サーバーから届いた進行イベントを解釈できませんでした（形式の不一致）。時間をおいて再度お試しください。";

/** Module-level so its identity is stable: the hook keys its effect on `open` and the request. */
function openFreeInputStream(request: FreeInputRequest) {
  return generateFreePassportServer({ data: request });
}

/**
 * The free-input screen, from empty form to dashboard. It is the second source behind the *same*
 * `PipelineRunState` the cached replay produces, which is why `PipelineTimeline` and
 * `PassportDashboard` are reused verbatim here rather than forked — nothing below this component
 * learns that the run came from a stranger's résumé instead of the committed cache.
 *
 * `available` is the server's answer to "is `AI_GATEWAY_API_KEY` set", never the key itself. With no
 * key the form is not shown at all; a caller who posts anyway still meets the server's typed refusal,
 * which arrives as a `Failed` event and renders through the same alert as any other failure.
 *
 * The static data arrives as props: the route loader owns loading it, so this component renders in a
 * test without the data layer behind it and nothing is decoded again on every streamed event.
 */
type FreeInputPassportProps = {
  available: boolean;
  jobs: readonly Job[];
  visas: readonly VisaRequirement[];
  vocabulary: readonly SkillVocabularyEntry[];
};

export function FreeInputPassport({ available, jobs, visas, vocabulary }: FreeInputPassportProps) {
  const [request, setRequest] = useState<FreeInputRequest | undefined>(undefined);
  const { completedCount, degraded, failureJa, isComplete, result, timings } = usePipelineStream({
    decodeFailureJa: DECODE_FAILURE_JA,
    open: openFreeInputStream,
    request,
    transportFailureJa: TRANSPORT_FAILURE_JA,
  });

  if (!available) {
    return (
      <Alert color="gray" title="現在は利用できません" variant="light">
        <Text size="sm">
          自由入力は公開URLから有料APIを呼ぶため、サーバー側で <Code>AI_GATEWAY_API_KEY</Code>{" "}
          の有無だけを見て判定します。キーが未設定のこの環境では、モデルを呼ぶ前に受け付けを止めています。
          プリセットのシェフは事前生成キャッシュから再生されるため、キーが無くても完全に動作します。
        </Text>
      </Alert>
    );
  }

  const running = request !== undefined && failureJa === undefined && !isComplete;

  // The result carries what the model read; the form carries what the judgement was told. The
  // persona is assembled from both here for the same reason the pipeline assembles it server-side.
  const view =
    request === undefined || result === undefined
      ? undefined
      : joinPassportView({
          jobs,
          persona: personaFromFreeInput(request, result.skillSet),
          result,
          visas,
          vocabulary,
        });

  return (
    <Stack gap="lg">
      <FreeInputForm onSubmit={setRequest} pending={running} />

      {failureJa === undefined ? null : (
        <Alert color="red" title="判定を完了できませんでした" variant="light">
          {/* Model and server text alike are rendered as text. See .claude/rules/common/security.md. */}
          {failureJa}
        </Alert>
      )}

      {running ? <PipelineTimeline completedCount={completedCount} timings={timings} /> : null}

      {degraded === undefined ? null : (
        <Alert color="yellow" title="一部の生成に失敗したため縮退しています" variant="light">
          {degraded.messageJa}
          <strong>適合判定とスコアは変わりません</strong>
          （判定は決定論、言語化のみLLMという設計のため）。
        </Alert>
      )}

      {view === undefined ? null : <PassportDashboard view={view} />}
    </Stack>
  );
}
