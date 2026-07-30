import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import type { StepTiming } from "~/data/schemas";
import { PipelineTimeline } from "~/features/passport/components/pipeline-timeline";
import { renderWithMantine } from "~/testing/render";

const TIMINGS: readonly StepTiming[] = [
  { durationMs: 1234, step: "extract" },
  { durationMs: 12, step: "visa" },
];

describe("PipelineTimeline", () => {
  it("4ステップを常に順番どおり出す", () => {
    renderWithMantine(<PipelineTimeline completedCount={0} timings={[]} />);

    expect(screen.getByText(/1\. スキルを抽出/)).toBeInTheDocument();
    expect(screen.getByText(/2\. 国別のビザ要件/)).toBeInTheDocument();
    expect(screen.getByText(/3\. スキル表現を現地/)).toBeInTheDocument();
    expect(screen.getByText(/4\. 海外求人とマッチング/)).toBeInTheDocument();
  });

  it("完了ぶんに完了印、次の1件に処理中、残りは待機中", () => {
    renderWithMantine(<PipelineTimeline completedCount={2} timings={TIMINGS} />);

    expect(screen.getAllByLabelText("完了").length).toBe(2);
    expect(screen.getAllByLabelText("処理中").length).toBe(1);
    expect(screen.getAllByLabelText("待機中").length).toBe(1);
  });

  it("完了したステップには実測値を出す", () => {
    renderWithMantine(<PipelineTimeline completedCount={2} timings={TIMINGS} />);

    // 丸めずに実測をそのまま出すことが、進捗バーではないことの担保になっている。
    expect(screen.getByText("実測 1234ms")).toBeInTheDocument();
    expect(screen.getByText("実測 12ms")).toBeInTheDocument();
  });

  it("ライブ由来でもキャッシュ由来でも、同じ props なら同じ表示になる", () => {
    // このコンポーネントは進捗の出どころを知らない。#7 の「タイムラインは分岐しない」はここで担保する。
    const { container: fromCache } = renderWithMantine(
      <PipelineTimeline completedCount={1} timings={[TIMINGS[0] as StepTiming]} />,
    );
    const cachedHtml = fromCache.innerHTML;

    const { container: fromLive } = renderWithMantine(
      <PipelineTimeline completedCount={1} timings={[{ durationMs: 1234, step: "extract" }]} />,
    );

    expect(fromLive.innerHTML).toBe(cachedHtml);
  });
});
