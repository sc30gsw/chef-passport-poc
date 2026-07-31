import { describe, expect, it } from "vite-plus/test";

import { lookupCachedPassport } from "~/data/cache-index";
import type { PipelineEvent } from "~/features/passport/types/pipeline-event";
import { STEP_LABELS_JA } from "~/features/passport/types/pipeline-event";
import { derivePipelineRunState } from "~/features/passport/utils/pipeline-run-state";

const cached = lookupCachedPassport("sato-takumi");
if (cached === undefined) throw new Error("sato-takumi のキャッシュが読めない");

function started(step: "extract" | "match" | "translate" | "visa"): PipelineEvent {
  return { _tag: "StepStarted", labelJa: STEP_LABELS_JA[step], step };
}

function completed(step: "extract" | "match" | "translate" | "visa"): PipelineEvent {
  return { _tag: "StepCompleted", durationMs: 1200, step };
}

const FULL_RUN: readonly PipelineEvent[] = [
  started("extract"),
  completed("extract"),
  started("visa"),
  completed("visa"),
  started("translate"),
  completed("translate"),
  started("match"),
  completed("match"),
];

describe("derivePipelineRunState", () => {
  it("何も来ていなければ 0 ステップ・未完了", () => {
    const state = derivePipelineRunState([]);

    expect(state.completedCount).toBe(0);
    expect(state.isComplete).toBe(false);
    expect(state.result).toBeUndefined();
  });

  it("StepCompleted のたびに進捗と実測値がたまる", () => {
    const state = derivePipelineRunState(FULL_RUN.slice(0, 4));

    expect(state.completedCount).toBe(2);
    expect(state.timings.map((timing) => timing.step)).toStrictEqual(["extract", "visa"]);
    expect(state.isComplete).toBe(false);
  });

  it("Completed で結果を受け取り、degraded も持ち越す", () => {
    const state = derivePipelineRunState([
      ...FULL_RUN,
      {
        _tag: "Completed",
        degraded: { messageJa: "落ちたのでキャッシュを再生しました", reason: "live-failed" },
        result: cached,
      },
    ]);

    expect(state.isComplete).toBe(true);
    expect(state.completedCount).toBe(4);
    expect(state.result?.personaId).toBe("sato-takumi");
    expect(state.degraded?.reason).toBe("live-failed");
  });

  it("degraded がなければ undefined のまま（正常運転は静かであるべき）", () => {
    const state = derivePipelineRunState([...FULL_RUN, { _tag: "Completed", result: cached }]);

    expect(state.degraded).toBeUndefined();
  });

  it("1ステップ目の開始が来たら、それまでの進捗は捨てて数え直す", () => {
    // サーバー側フォールバックの見え方そのもの。ライブが途中で落ちたあとキャッシュ再生が
    // 最初から流れてくるので、タイムラインは足し算ではなくやり直しにならなければならない。
    const state = derivePipelineRunState([
      started("extract"),
      completed("extract"),
      started("visa"),
      ...FULL_RUN,
      { _tag: "Completed", result: cached },
    ]);

    expect(state.timings.length).toBe(4);
    expect(state.timings.map((timing) => timing.step)).toStrictEqual([
      "extract",
      "visa",
      "translate",
      "match",
    ]);
  });

  it("Failed は日本語メッセージを残し、完了扱いにはしない", () => {
    const state = derivePipelineRunState([
      { _tag: "Failed", messageJa: "読み込めませんでした", step: "load" },
    ]);

    expect(state.failureJa).toBe("読み込めませんでした");
    expect(state.isComplete).toBe(false);
  });

  it("ステップイベントが1件も無いまま Completed が来ても、結果の実測値で埋まる", () => {
    const state = derivePipelineRunState([{ _tag: "Completed", result: cached }]);

    expect(state.timings).toStrictEqual(cached.timings);
  });
});
