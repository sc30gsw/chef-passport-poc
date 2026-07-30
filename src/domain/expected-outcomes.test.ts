import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { loadJobs, loadPersonas, loadVisaRequirements } from "~/data/loaders";
import type { Grade, Persona, VisaAssessment } from "~/data/schemas";
import { assessAllCountries } from "~/domain/visa-eligibility";

/**
 * §3.3 of PLAN.md: this table is a **specification**, not an observation. The visa figures and
 * job salaries in `src/data/` were designed backwards from it. If a threshold changes, the
 * numbers move — the table does not.
 *
 * Without this test, nothing guarantees the outcomes `docs/requirement.md` promises the
 * interviewer, and "scoring is deterministic" would be an unbacked claim.
 */

const personas = Effect.runSync(loadPersonas);
const visas = Effect.runSync(loadVisaRequirements);
const jobs = Effect.runSync(loadJobs);

const EXPECTED_GRADES = {
  "sato-takumi": { AU: "○", SG: "◎", US: "△" },
  "suzuki-haruka": { AU: "○", SG: "○", US: "△" },
  "takahashi-kenta": { AU: "○", SG: "△", US: "△" },
} as const satisfies Record<string, Record<"AU" | "SG" | "US", Grade>>;

function personaById(id: string): Persona {
  const found = personas.find((persona) => persona.id === id);
  if (found === undefined) throw new Error(`fixture persona missing: ${id}`);
  return found;
}

function assessmentFor(personaId: string, country: "AU" | "SG" | "US") {
  return assessAllCountries(personaById(personaId), visas, jobs).find(
    (result) => result.country === country,
  );
}

function eligibleVisaIds(visaList: readonly VisaAssessment[]): readonly string[] {
  return visaList.filter((visa) => visa.eligible).map((visa) => visa.visaId);
}

describe("期待結果表（PLAN.md §3.3）", () => {
  for (const [personaId, expected] of Object.entries(EXPECTED_GRADES)) {
    it(`${personaId} は SG=${expected.SG} / AU=${expected.AU} / US=${expected.US}`, () => {
      const grades = Object.fromEntries(
        assessAllCountries(personaById(personaId), visas, jobs).map((result) => [
          result.country,
          result.grade,
        ]),
      );

      expect(grades).toStrictEqual(expected);
    });
  }

  it("鈴木と高橋はどちらもAU○だが、通るビザが違う", () => {
    // This divergence is the proof the mechanism is general rather than a fixed output.
    expect(eligibleVisaIds(assessmentFor("suzuki-haruka", "AU")?.visas ?? [])).toContain(
      "au-482-skills-in-demand",
    );
    expect(eligibleVisaIds(assessmentFor("takahashi-kenta", "AU")?.visas ?? [])).not.toContain(
      "au-482-skills-in-demand",
    );
    expect(eligibleVisaIds(assessmentFor("takahashi-kenta", "AU")?.visas ?? [])).toContain(
      "au-417-working-holiday",
    );
  });

  it("佐藤は年齢超過で417が対象外になる", () => {
    const workingHoliday = assessmentFor("sato-takumi", "AU")?.visas.find(
      (visa) => visa.visaId === "au-417-working-holiday",
    );

    expect(workingHoliday?.eligible).toBe(false);
    expect(workingHoliday?.blockedReasonsJa.join()).toContain("年齢上限30歳を超過");
  });

  it("US はどのペルソナでも通らず、△の理由が必ず示される", () => {
    for (const persona of personas) {
      const us = assessmentFor(persona.id, "US");

      expect(us?.grade).toBe("△");
      expect(us?.bestVisaId).toBeNull();
      for (const visa of us?.visas ?? []) {
        expect(visa.blockedReasonsJa.length).toBeGreaterThan(0);
      }
    }
  });

  it("O-1 は実績証明の不足を理由に挙げる", () => {
    expect(
      assessmentFor("sato-takumi", "US")
        ?.visas.find((visa) => visa.visaId === "us-o1")
        ?.blockedReasonsJa.join(),
    ).toContain("卓越性を立証する実績がない");
  });

  it("H-2B は通年求人しかないことを理由に挙げる", () => {
    expect(
      assessmentFor("sato-takumi", "US")
        ?.visas.find((visa) => visa.visaId === "us-h2b")
        ?.blockedReasonsJa.join(),
    ).toContain("通年の常勤ポジション");
  });

  it("高橋の SG はどちらのビザも給与下限に届かないことが理由", () => {
    const sg = assessmentFor("takahashi-kenta", "SG");

    expect(sg?.grade).toBe("△");
    expect(sg?.visas.length).toBe(2);
    for (const visa of sg?.visas ?? []) {
      expect(visa.blockedReasonsJa.join()).toContain("給与下限");
    }
  });

  it("佐藤のSGは◎、かつスコアが閾値70を明確に超える", () => {
    const sg = assessmentFor("sato-takumi", "SG");

    expect(sg?.grade).toBe("◎");
    expect(sg?.score).toBeGreaterThanOrEqual(70);
  });
});
