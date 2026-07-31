import { describe, expect, it } from "vite-plus/test";

import { MIN_RESUME_LENGTH } from "~/features/passport/types/free-input-request";
import type { FreeInputDraft } from "~/features/passport/utils/free-input-draft";
import {
  EMPTY_DRAFT,
  ageErrorJa,
  decodeFreeInputDraft,
  languageLevelErrorJa,
  resumeErrorJa,
} from "~/features/passport/utils/free-input-draft";

const VALID: FreeInputDraft = {
  age: 32,
  hasEvidenceProof: false,
  languageLevel: "conversational",
  resume: "あ".repeat(MIN_RESUME_LENGTH),
};

describe("フィールド単位のメッセージ", () => {
  it("未入力は送信を試みるまで黙っている", () => {
    expect(resumeErrorJa(EMPTY_DRAFT.resume, false)).toBeUndefined();
    expect(ageErrorJa(EMPTY_DRAFT.age, false)).toBeUndefined();
    expect(languageLevelErrorJa(EMPTY_DRAFT.languageLevel, false)).toBeUndefined();
  });

  it("送信を試みたら何を直せばよいか言う", () => {
    expect(resumeErrorJa("短い", true)).toBe(`${MIN_RESUME_LENGTH}文字以上入力してください`);
    expect(ageErrorJa("", true)).toBe("年齢を整数で入力してください");
    expect(languageLevelErrorJa("", true)).toBe("英語レベルを選択してください");
  });

  it("上限超過は送信を試みる前から言う", () => {
    expect(resumeErrorJa("あ".repeat(2003), false)).toBe("上限を3文字超えています");
  });
});

describe("decodeFreeInputDraft", () => {
  it("妥当な下書きはサーバーが受け取るリクエストそのものになる", () => {
    const decoded = decodeFreeInputDraft(VALID);

    expect(decoded).toEqual({
      ok: true,
      request: {
        age: 32,
        hasEvidenceProof: false,
        languageLevel: "conversational",
        resume: VALID.resume,
      },
    });
  });

  it("フィールド単位のメッセージが拾えない不一致も、文言として取り出せる", () => {
    // これが finding 9 の本体。フォーム側の検証はスキーマの上位集合であり続ける必要があるが、
    // それが崩れた日に「ボタンを押しても何も起きない」で終わらせないのがこの経路。
    const drifted = { ...VALID, languageLevel: "fluent" } as unknown as FreeInputDraft;

    expect(resumeErrorJa(drifted.resume, true)).toBeUndefined();
    expect(ageErrorJa(drifted.age, true)).toBeUndefined();
    expect(languageLevelErrorJa(drifted.languageLevel, true)).toBeUndefined();

    const decoded = decodeFreeInputDraft(drifted);

    expect(decoded.ok).toBe(false);
    expect(decoded.ok ? [] : decoded.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("languageLevel")]),
    );
  });

  it("結果はEffectの型ではなく素のデータで返る（コンポーネントがEffectを触らないため）", () => {
    // .claude/rules/typescript/effect-patterns.md の "Where Effect applies" 表では
    // components/ は Effect 非対象。Either を返すとフォーム側が Either.isRight を呼ぶことになる。
    expect(Object.keys(decodeFreeInputDraft(VALID))).toEqual(["ok", "request"]);
  });
});
