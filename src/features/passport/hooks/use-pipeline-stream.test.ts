import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vite-plus/test";

import { lookupCachedPassport } from "~/data/cache-index";
import type { PassportResult } from "~/data/schemas";
import { usePipelineStream } from "~/features/passport/hooks/use-pipeline-stream";
import type { PipelineEvent } from "~/features/passport/types/pipeline-event";
import { STEP_LABELS_JA, encodePipelineEvent } from "~/features/passport/types/pipeline-event";

const TRANSPORT_JA = "転送に失敗しました";
const DECODE_JA = "イベントを解釈できませんでした";

const RESULT = lookupCachedPassport("sato-takumi") as PassportResult;

const EXTRACT_STARTED: PipelineEvent = {
  _tag: "StepStarted",
  labelJa: STEP_LABELS_JA.extract,
  step: "extract",
};
const EXTRACT_DONE: PipelineEvent = { _tag: "StepCompleted", durationMs: 111, step: "extract" };

/** Every `open` below is module-level, the way the real callers declare theirs: the effect keys on it. */
function streamOf(chunks: readonly unknown[]) {
  return () =>
    Promise.resolve(
      (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
    );
}

function encodeAll(events: readonly PipelineEvent[]) {
  return events.map((event) => encodePipelineEvent(event));
}

const openTruncated = streamOf(encodeAll([EXTRACT_STARTED, EXTRACT_DONE]));
const openCompleted = streamOf(encodeAll([EXTRACT_DONE, { _tag: "Completed", result: RESULT }]));
const openUndecodable = streamOf([{ _tag: "SomethingElse", step: "extract" }]);
const openRejects = () => Promise.reject(new Error("network down"));

function stream(open: () => Promise<AsyncIterable<unknown>>) {
  return renderHook(() =>
    usePipelineStream({
      decodeFailureJa: DECODE_JA,
      open,
      request: "sato-takumi",
      transportFailureJa: TRANSPORT_JA,
    }),
  );
}

describe("usePipelineStream", () => {
  it("終端イベントが来れば完了として扱う", async () => {
    const { result } = stream(openCompleted);

    await waitFor(() => expect(result.current.isComplete).toBe(true));
    expect(result.current.failureJa).toBeUndefined();
  });

  it("終端イベントなしでストリームが尽きたら、成功ではなく転送失敗にする", async () => {
    const { result } = stream(openTruncated);

    // 本文が途中で切れた（接続断・実行時間上限）ときの唯一の合図が「終端イベントが無い」こと。
    // ここで成功扱いにすると、解決も失敗もしないスピナーのまま止まる。
    await waitFor(() => expect(result.current.failureJa).toBe(TRANSPORT_JA));
    expect(result.current.isComplete).toBe(false);
  });

  it("リクエストが届かなければ転送失敗の文言を返す", async () => {
    const { result } = stream(openRejects);

    await waitFor(() => expect(result.current.failureJa).toBe(TRANSPORT_JA));
  });

  it("StrictModeの二重マウントでもリクエストは1本しか開かない", async () => {
    let opens = 0;
    const openCounting = () => {
      opens += 1;
      return openCompleted();
    };

    // StrictModeはdevでエフェクトを mount→cleanup→remount と2回走らせる。1本目のリクエストが
    // サーバーに届くと single-flight スロットを先取りし、ユーザーが実際に見ている2本目が
    // in-flight 拒否でキャッシュ再生に降格する——dev でライブ生成が常に降格して見えた原因。
    const { result } = renderHook(
      () =>
        usePipelineStream({
          decodeFailureJa: DECODE_JA,
          open: openCounting,
          request: "sato-takumi",
          transportFailureJa: TRANSPORT_JA,
        }),
      { wrapper: StrictMode },
    );

    await waitFor(() => expect(result.current.isComplete).toBe(true));
    expect(opens).toBe(1);
  });

  it("復号できないチャンクは転送失敗とは別の文言になる", async () => {
    const { result } = stream(openUndecodable);

    // スキーマの不一致はサーバーとの契約バグであって、接続の問題ではない。
    // 同じ文言にすると、直すべき場所を指さない案内を出すことになる。
    await waitFor(() => expect(result.current.failureJa).toBe(DECODE_JA));
  });
});
