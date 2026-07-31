import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { FreeInputForm } from "~/features/passport/components/free-input-form";
import { MAX_RESUME_LENGTH, MIN_RESUME_LENGTH } from "~/features/passport/types/free-input-request";
import { renderWithMantine } from "~/testing/render";

const VALID_RESUME = "あ".repeat(MIN_RESUME_LENGTH);

function resumeBox() {
  return screen.getByRole("textbox", { name: /経歴・職務内容/ });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(resumeBox());
  await user.paste(VALID_RESUME);
  await user.click(screen.getByRole("textbox", { name: /年齢/ }));
  await user.paste("32");
  await user.click(screen.getByRole("radio", { name: "日常会話レベル" }));
}

describe("FreeInputForm", () => {
  it("すべてのコントロールにアクセシブル名がある", () => {
    renderWithMantine(<FreeInputForm onSubmit={vi.fn()} pending={false} />);

    expect(resumeBox()).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /年齢/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "ほぼ不可" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "ビジネスレベル" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /実績証明/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "この経歴で判定する" })).toBeInTheDocument();
  });

  it("残り文字数を表示し、入力に応じて減らす", async () => {
    const user = userEvent.setup();
    renderWithMantine(<FreeInputForm onSubmit={vi.fn()} pending={false} />);

    expect(screen.getByText(new RegExp(`残り${MAX_RESUME_LENGTH}文字`))).toBeInTheDocument();

    await user.click(resumeBox());
    await user.paste("あ".repeat(10));

    expect(screen.getByText(new RegExp(`残り${MAX_RESUME_LENGTH - 10}文字`))).toBeInTheDocument();
  });

  it("上限を超えたら超過分を表示し、送信できなくする", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<FreeInputForm onSubmit={onSubmit} pending={false} />);

    await user.click(resumeBox());
    await user.paste("あ".repeat(MAX_RESUME_LENGTH + 3));

    // 上限はスキーマが強制する。画面表示はその予告であって、代わりではない。
    expect(screen.getByText("上限を3文字超えています")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "この経歴で判定する" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("短すぎる経歴文は送信されず、必要な文字数を示す", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<FreeInputForm onSubmit={onSubmit} pending={false} />);

    await user.click(resumeBox());
    await user.paste("寿司職人です。");
    await user.click(screen.getByRole("button", { name: "この経歴で判定する" }));

    expect(screen.getByText(`${MIN_RESUME_LENGTH}文字以上入力してください`)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("年齢と英語レベルが未入力なら送信されない", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<FreeInputForm onSubmit={onSubmit} pending={false} />);

    await user.click(resumeBox());
    await user.paste(VALID_RESUME);
    await user.click(screen.getByRole("button", { name: "この経歴で判定する" }));

    // 年齢と語学レベルは判定入力なので、モデルにも既定値にも推測させない。
    expect(screen.getByText("年齢を整数で入力してください")).toBeInTheDocument();
    expect(screen.getByText("英語レベルを選択してください")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("妥当な入力はスキーマで復号したリクエストとして渡る", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<FreeInputForm onSubmit={onSubmit} pending={false} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "この経歴で判定する" }));

    expect(onSubmit).toHaveBeenCalledWith({
      age: 32,
      hasEvidenceProof: false,
      languageLevel: "conversational",
      resume: VALID_RESUME,
    });
  });

  it("実績証明のチェックはそのまま判定入力になる", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<FreeInputForm onSubmit={onSubmit} pending={false} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("checkbox", { name: /実績証明/ }));
    await user.click(screen.getByRole("button", { name: "この経歴で判定する" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ hasEvidenceProof: true }));
  });

  it("実行中は送信できない（自由入力の同時実行は1件まで）", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<FreeInputForm onSubmit={onSubmit} pending />);

    await fillValidForm(user);

    expect(screen.getByRole("button", { name: /判定中/ })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
