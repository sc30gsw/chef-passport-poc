import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { StepTiming } from "~/data/schemas";
import { usePipelineReplay } from "~/features/passport/hooks/use-pipeline-replay";
import { clampReplayMs } from "~/features/passport/utils/replay-pacing";

const FOUR_STEPS: readonly StepTiming[] = [
  { durationMs: 1200, step: "extract" },
  { durationMs: 900, step: "visa" },
  { durationMs: 300, step: "translate" },
  { durationMs: 4000, step: "match" },
];

/** A cache that recorded fewer steps than the timeline draws — what the server replays verbatim. */
const TWO_STEPS: readonly StepTiming[] = [
  { durationMs: 1000, step: "extract" },
  { durationMs: 1000, step: "visa" },
];

function totalReplayMs(timings: readonly StepTiming[]) {
  return timings.reduce((total, timing) => total + clampReplayMs(timing.durationMs), 0);
}

function replay(timings: readonly StepTiming[]) {
  return renderHook((props: Record<"timings", readonly StepTiming[]>) => usePipelineReplay(props), {
    initialProps: { timings },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePipelineReplay", () => {
  it("記録が無ければ再生するものが無いので即完了", () => {
    const { result } = replay([]);

    expect(result.current).toEqual({ completedCount: 0, isComplete: true });
  });

  it("実測値をクランプした間隔で1ステップずつ進む", () => {
    const { result } = replay(FOUR_STEPS);

    expect(result.current.completedCount).toBe(0);

    act(() => {
      vi.advanceTimersByTime(clampReplayMs(1200));
    });
    expect(result.current.completedCount).toBe(1);

    act(() => {
      vi.advanceTimersByTime(clampReplayMs(900));
    });
    expect(result.current.completedCount).toBe(2);
  });

  it("記録されたステップぶんだけ進んで完了する（サーバー側の再生と同じ本数）", () => {
    const { result } = replay(TWO_STEPS);

    act(() => {
      vi.advanceTimersByTime(totalReplayMs(TWO_STEPS));
    });

    // pipeline-service.ts の再生は `cached.timings` を流す。クライアントが STEP_ORDER を埋めて
    // 4本に水増しすると、同じキャッシュが経路によって違う長さで再生されてしまう。
    expect(result.current).toEqual({ completedCount: 2, isComplete: true });
  });

  it("timings が入れ替わったら進捗はその場で0に戻る", () => {
    const { rerender, result } = replay(FOUR_STEPS);

    act(() => {
      vi.advanceTimersByTime(totalReplayMs(FOUR_STEPS));
    });
    expect(result.current).toEqual({ completedCount: 4, isComplete: true });

    rerender({ timings: TWO_STEPS });

    // ここで前の run の 4 が1フレームでも残ると、CachedPassport は完成した
    // ダッシュボードを出してから進捗リストに戻る。本番のフォールバック経路の見た目が壊れる。
    expect(result.current).toEqual({ completedCount: 0, isComplete: false });
  });

  it("入れ替わったあとは新しい timings のペースで進む", () => {
    const { rerender, result } = replay(FOUR_STEPS);

    act(() => {
      vi.advanceTimersByTime(totalReplayMs(FOUR_STEPS));
    });
    rerender({ timings: TWO_STEPS });

    act(() => {
      vi.advanceTimersByTime(totalReplayMs(TWO_STEPS));
    });

    expect(result.current).toEqual({ completedCount: 2, isComplete: true });
  });
});
