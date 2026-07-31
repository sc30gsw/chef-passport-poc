import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import type { PassportView } from "~/features/passport/api/passport-server";
import { loadPassportView } from "~/features/passport/api/passport-view";
import { JobMatchList } from "~/features/passport/components/job-match-list";
import { passportPipelineFromCache } from "~/lib/runtime";
import { renderWithMantine } from "~/testing/render";

type JobMatchView = PassportView["jobMatches"][number];

let view: PassportView;

/** Fixtures come through the same Layer the server function uses, so they cannot drift from it. */
const preset = passportPipelineFromCache({ paced: false });

beforeAll(async () => {
  const sato = await loadPassportView("sato-takumi", preset);
  if (!sato.ok) throw new Error("fixture view failed to load");
  view = sato.data;
});

/** Real matches with chosen scores, one per colour band. */
function scoredBands(): JobMatchView[] {
  return [70, 50, 49].map((score, index) => {
    const match = view.jobMatches[index];
    if (match === undefined) throw new Error("マッチが3件に満たない");

    return { ...match, match: { ...match.match, score } };
  });
}

describe("JobMatchList", () => {
  it("上位5件までを見出しの件数どおりに出す", () => {
    renderWithMantine(
      <JobMatchList excludedJobs={view.excludedJobs} jobMatches={view.jobMatches} />,
    );

    const shown = Math.min(5, view.jobMatches.length);

    expect(
      screen.getByRole("heading", {
        name: `求人マッチ（上位${shown}件 / 全${view.jobMatches.length}件）`,
      }),
    ).toBeInTheDocument();
  });

  it("しきい値をまたぐスコアもそのままの数値で出す", () => {
    renderWithMantine(<JobMatchList excludedJobs={[]} jobMatches={scoredBands()} />);

    // 色は表示の都合。読み手に対する約束はスコアそのものを丸めずに出すことなので、
    // 検証もそちらに置く（Mantine の内部クラスを覗く検証にはしない）。
    expect(screen.getByText("70 / 100")).toBeInTheDocument();
    expect(screen.getByText("50 / 100")).toBeInTheDocument();
    expect(screen.getByText("49 / 100")).toBeInTheDocument();
  });

  it("除外求人は畳んだまま件数を示し、開くと理由が出る", async () => {
    renderWithMantine(
      <JobMatchList excludedJobs={view.excludedJobs} jobMatches={view.jobMatches} />,
    );

    const toggle = screen.getByRole("button", {
      name: new RegExp(`除外 ${view.excludedJobs.length} 件`),
    });

    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    expect(screen.getByRole("button", { name: /除外/ })).toHaveAttribute("aria-expanded", "true");
    for (const excluded of view.excludedJobs) {
      expect(screen.getAllByText(excluded.reasonJa).length).toBeGreaterThan(0);
    }
  });
});
