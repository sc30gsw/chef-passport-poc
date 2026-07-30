import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import type { PassportView } from "~/features/passport/api/passport-server";
import { loadPassportView } from "~/features/passport/api/passport-view";
import { PassportDashboard } from "~/features/passport/components/passport-dashboard";
import { passportPipelineFromCache } from "~/lib/runtime";
import { renderWithMantine } from "~/testing/render";

let satoView: PassportView;
let takahashiView: PassportView;

/** Fixtures come through the same Layer the server function uses, so they cannot drift from it. */
const preset = passportPipelineFromCache({ paced: false });

beforeAll(async () => {
  const sato = await loadPassportView("sato-takumi", preset);
  const takahashi = await loadPassportView("takahashi-kenta", preset);
  if (!sato.ok || !takahashi.ok) throw new Error("fixture views failed to load");
  satoView = sato.data;
  takahashiView = takahashi.data;
});

describe("PassportDashboard", () => {
  it("3カ国のカードを見出しとして出す", () => {
    renderWithMantine(<PassportDashboard view={satoView} />);

    expect(screen.getByRole("heading", { name: "シンガポール" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "オーストラリア" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "アメリカ" })).toBeInTheDocument();
  });

  it("佐藤は SG=◎ / AU=○ / US=△ を表示する", () => {
    renderWithMantine(<PassportDashboard view={satoView} />);

    // 等級はドメインロジックが決めた値。UIはそれをそのまま出すだけ。
    expect(screen.getByLabelText("シンガポールの適合度 ◎")).toBeInTheDocument();
    expect(screen.getByLabelText("オーストラリアの適合度 ○")).toBeInTheDocument();
    expect(screen.getByLabelText("アメリカの適合度 △")).toBeInTheDocument();
  });

  it("全ビザカードに出典の外部リンクがある", () => {
    renderWithMantine(<PassportDashboard view={satoView} />);

    const sources = screen.getAllByRole("link", { name: "出典（公式ページ）" });

    // 3カ国 × 2種 = 6件。免責と並んで法的リスクを遮断する部分。
    expect(sources.length).toBe(6);
    for (const link of sources) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("対象外のビザは理由を画面に出す", () => {
    renderWithMantine(<PassportDashboard view={satoView} />);

    // 決定論的な説明文にも同じ理由が入るため複数箇所に出る。要件は「必ず示される」こと。
    expect(screen.getAllByText(/年齢上限30歳を超過/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/卓越性を立証する実績がない/).length).toBeGreaterThan(0);
  });

  it("除外求人は既定で畳まれ、ボタンで開ける", async () => {
    renderWithMantine(<PassportDashboard view={satoView} />);

    const toggle = screen.getByRole("button", { name: /除外 3 件/ });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/ビザスポンサー不可の求人/)).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(screen.getByRole("button", { name: /除外 3 件/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getAllByText(/ビザスポンサー不可の求人/).length).toBe(3);
  });

  it("高橋は417が通るので除外が2件で済む", async () => {
    renderWithMantine(<PassportDashboard view={takahashiView} />);

    await userEvent.click(screen.getByRole("button", { name: /除外 2 件/ }));

    expect(screen.getAllByText(/ビザスポンサー不可の求人/).length).toBe(2);
  });

  it("文章の出所が決定論的なときはバナーで明示する", () => {
    renderWithMantine(<PassportDashboard view={satoView} />);

    // LLM文と取り違えさせないための表示。
    if (satoView.proseSource === "deterministic") {
      expect(screen.getByText(/説明文は決定論的なフォールバックです/)).toBeInTheDocument();
    } else {
      expect(screen.queryByText(/説明文は決定論的なフォールバックです/)).not.toBeInTheDocument();
    }
  });

  it("求人マッチのスコアを表示する", () => {
    renderWithMantine(<PassportDashboard view={satoView} />);

    const topScore = satoView.jobMatches[0]?.match.score ?? 0;

    expect(screen.getAllByText(`${topScore} / 100`).length).toBeGreaterThan(0);
  });
});
