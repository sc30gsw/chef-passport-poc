import { screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import type { VisaRequirement } from "~/data/schemas";
import type { PassportView } from "~/features/passport/api/passport-server";
import { loadPassportView } from "~/features/passport/api/passport-view";
import { CountryGradeCard } from "~/features/passport/components/country-grade-card";
import { passportPipelineFromCache } from "~/lib/runtime";
import { renderWithMantine } from "~/testing/render";

type CountryView = PassportView["countries"][number];

let australia: CountryView;

/** Fixtures come through the same Layer the server function uses, so they cannot drift from it. */
const preset = passportPipelineFromCache({ paced: false });

/**
 * A requirement present in the live JSON but absent from the committed cache — cache drift, which
 * is the only way a visa can reach the screen with nobody having judged it.
 */
const UNASSESSED: VisaRequirement = {
  country: "AU",
  durationNote: "デモ用の未判定ビザ",
  expectedLanguage: "conversational",
  id: "au-unassessed-demo",
  minExperienceYears: 3,
  name: "未判定デモビザ",
  requiresEvidenceProof: false,
  requiresSeasonalRole: false,
  requiresSponsor: true,
  sourceUrl: "https://example.invalid/unassessed",
};

beforeAll(async () => {
  const sato = await loadPassportView("sato-takumi", preset);
  if (!sato.ok) throw new Error("fixture view failed to load");

  const found = sato.data.countries.find((country) => country.country === "AU");
  if (found === undefined) throw new Error("AU が結果に無い");
  australia = found;
});

describe("CountryGradeCard", () => {
  it("判定済みのビザはクリア／対象外を名前つきで示す", () => {
    renderWithMantine(<CountryGradeCard country={australia} />);

    // 判定は決定論ロジックの出力。カードはそれをそのまま出す。
    for (const requirement of australia.visaRequirements) {
      const assessment = australia.visas.find((visa) => visa.visaId === requirement.id);
      if (assessment === undefined) continue;

      const statusJa = assessment.eligible ? "クリア" : "対象外";
      expect(screen.getByText(`${requirement.name}の判定 ${statusJa}`)).toBeInTheDocument();
    }
  });

  it("判定が存在しないビザを対象外と言い切らない", () => {
    const drifted: CountryView = {
      ...australia,
      visaRequirements: [...australia.visaRequirements, UNASSESSED],
    };

    renderWithMantine(<CountryGradeCard country={drifted} />);

    // 「判定して落ちた」と「誰も判定していない」は別物。法的免責の下で確信のある
    // 対象外バッジを出すのは、この画面が主張している監査可能性そのものを損なう。
    expect(screen.getByText("未判定デモビザの判定 判定なし")).toBeInTheDocument();
    expect(screen.queryByText("未判定デモビザの判定 対象外")).not.toBeInTheDocument();
  });
});
