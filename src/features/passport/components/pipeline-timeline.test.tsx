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

  it("各ステップの状態は読み上げ可能なテキストで持つ", () => {
    renderWithMantine(<PipelineTimeline completedCount={2} timings={TIMINGS} />);

    // アイコンと色だけだと支援技術には何も伝わらない。状態は li の名前に載せる。
    expect(screen.getAllByRole("listitem", { name: /: 完了$/ }).length).toBe(2);
    expect(screen.getAllByRole("listitem", { name: /: 処理中$/ }).length).toBe(1);
    expect(screen.getAllByRole("listitem", { name: /: 待機中$/ }).length).toBe(1);
    expect(
      screen.getByRole("listitem", {
        name: "3. スキル表現を現地の厨房用語に変換しています: 処理中",
      }),
    ).toBeInTheDocument();
  });

  it("走っている間は aria-busy、終わったら外れる", () => {
    // 監査 #17 finding 7。組み立て途中の一覧を読み上げさせないための印。
    const { container: running } = renderWithMantine(
      <PipelineTimeline completedCount={2} timings={TIMINGS} />,
    );
    expect(running.querySelector("[aria-busy='true']")).not.toBeNull();

    const { container: finished } = renderWithMantine(
      <PipelineTimeline completedCount={4} timings={TIMINGS} />,
    );
    expect(finished.querySelector("[aria-busy='true']")).toBeNull();
  });

  it("進行状況を polite なライブリージョンで告知する", () => {
    renderWithMantine(<PipelineTimeline completedCount={1} timings={TIMINGS} />);

    // 一覧が黙って書き換わるのではなく、いま何をしているかが読み上げられる。
    expect(screen.getByRole("status")).toHaveTextContent("4ステップ中1ステップ完了");
    expect(screen.getByRole("status")).toHaveTextContent("国別のビザ要件");
  });

  it("全ステップ完了もライブリージョンで告知する", () => {
    renderWithMantine(<PipelineTimeline completedCount={4} timings={TIMINGS} />);

    expect(screen.getByRole("status")).toHaveTextContent("AI処理が完了しました");
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
