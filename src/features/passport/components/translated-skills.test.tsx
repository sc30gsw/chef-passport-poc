import { screen } from "@testing-library/react";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { loadSkillVocabulary } from "~/data/loaders";
import type { TranslatedSkill } from "~/data/schemas";
import { TranslatedSkills } from "~/features/passport/components/translated-skills";
import { renderWithMantine } from "~/testing/render";

const vocabulary = Effect.runSync(loadSkillVocabulary);

const WITH_SOURCE: TranslatedSkill = {
  localEn: "Slicing white-fish sashimi",
  skillId: "sashimi-slicing",
  sourceJa: "白身の刺身引き",
};

/** What the generator produces when the model returned a translation but no source phrase. */
const WITHOUT_SOURCE: TranslatedSkill = {
  localEn: "Forming nigiri",
  skillId: "nigiri-forming",
  sourceJa: "",
};

describe("TranslatedSkills", () => {
  it("翻訳が無いプリセットは空箱ではなく理由を出す", () => {
    renderWithMantine(<TranslatedSkills translatedSkills={[]} vocabulary={vocabulary} />);

    expect(screen.getByText(/オフライン生成のため翻訳文がありません/)).toBeInTheDocument();
  });

  it("原文があればそれを、無ければ語彙のラベルを出す", () => {
    renderWithMantine(
      <TranslatedSkills translatedSkills={[WITH_SOURCE, WITHOUT_SOURCE]} vocabulary={vocabulary} />,
    );

    const fallback = vocabulary.find((entry) => entry.id === "nigiri-forming")?.labelJa;

    expect(screen.getByText("白身の刺身引き")).toBeInTheDocument();
    expect(screen.getByText(fallback as string)).toBeInTheDocument();
  });

  it("原文も語彙も無ければ、空行ではなく欠落を明示する", () => {
    // 語彙に無い ID は起こらない想定だが、起きたときに英文だけが宙に浮くのは
    // このコンポーネント自身が避けると宣言している見せ方。
    renderWithMantine(<TranslatedSkills translatedSkills={[WITHOUT_SOURCE]} vocabulary={[]} />);

    expect(screen.getByText("（原文なし）")).toBeInTheDocument();
    expect(screen.getByText("Forming nigiri")).toBeInTheDocument();
  });
});
