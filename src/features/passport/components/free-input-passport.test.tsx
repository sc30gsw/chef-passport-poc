import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { lookupCachedPassport } from "~/data/cache-index";
import { loadJobs, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import type { PassportResult } from "~/data/schemas";
import { FreeInputPassport } from "~/features/passport/components/free-input-passport";
import { MIN_RESUME_LENGTH } from "~/features/passport/types/free-input-request";
import type { EncodedPipelineEvent, PipelineEvent } from "~/features/passport/types/pipeline-event";
import { STEP_LABELS_JA, encodePipelineEvent } from "~/features/passport/types/pipeline-event";
import { renderWithMantine } from "~/testing/render";

/** Supplied by the route loader in the app; a component test provides it the same way. */
const REFERENCE = {
  jobs: Effect.runSync(loadJobs),
  visas: Effect.runSync(loadVisaRequirements),
  vocabulary: Effect.runSync(loadSkillVocabulary),
};

/**
 * The server function is the seam. Mocking it keeps the whole server graph — pipeline, gateway
 * client, committed cache — out of a component test, and lets a scripted stream stand in for a run
 * the way a stub Layer stands in for a model. See .claude/rules/common/testing.md.
 */
const transport = vi.hoisted(() => ({
  open: (): Promise<AsyncIterable<EncodedPipelineEvent>> => Promise.reject(new Error("unset")),
}));

vi.mock("~/features/passport/api/free-input-server", () => ({
  generateFreePassportServer: () => transport.open(),
}));

const RESULT = lookupCachedPassport("sato-takumi") as PassportResult;

function gate() {
  let open = () => {};
  const passed = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { open, passed };
}

function started(step: "extract" | "visa"): PipelineEvent {
  return { _tag: "StepStarted", labelJa: STEP_LABELS_JA[step], step };
}

function scriptEvents(events: readonly PipelineEvent[]) {
  transport.open = () =>
    Promise.resolve(
      (async function* () {
        for (const event of events) yield encodePipelineEvent(event);
      })(),
    );
}

async function submitResume(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("textbox", { name: /経歴・職務内容/ }));
  await user.paste("あ".repeat(MIN_RESUME_LENGTH));
  await user.click(screen.getByRole("textbox", { name: /年齢/ }));
  await user.paste("32");
  await user.click(screen.getByRole("radio", { name: "日常会話レベル" }));
  await user.click(screen.getByRole("button", { name: "この経歴で判定する" }));
}

beforeEach(() => {
  transport.open = () => Promise.reject(new Error("unset"));
});

describe("FreeInputPassport — 利用可否", () => {
  it("サーバーに鍵が無ければフォームを出さず、理由を明示する", () => {
    renderWithMantine(<FreeInputPassport available={false} {...REFERENCE} />);

    expect(screen.getByText(/現在は利用できません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "この経歴で判定する" })).not.toBeInTheDocument();
  });

  it("鍵があればフォームを出す", () => {
    renderWithMantine(<FreeInputPassport available {...REFERENCE} />);

    expect(screen.getByRole("button", { name: "この経歴で判定する" })).toBeInTheDocument();
  });
});

describe("FreeInputPassport — ライブ生成", () => {
  it("送信するとステップが到着順に進み、完了でダッシュボードに変わる", async () => {
    const first = gate();
    const second = gate();

    transport.open = () =>
      Promise.resolve(
        (async function* () {
          yield encodePipelineEvent(started("extract"));
          yield encodePipelineEvent({ _tag: "StepCompleted", durationMs: 111, step: "extract" });
          await first.passed;
          yield encodePipelineEvent(started("visa"));
          yield encodePipelineEvent({ _tag: "StepCompleted", durationMs: 222, step: "visa" });
          await second.passed;
          yield encodePipelineEvent({ _tag: "Completed", result: RESULT });
        })(),
      );

    const user = userEvent.setup();
    renderWithMantine(<FreeInputPassport available {...REFERENCE} />);
    await submitResume(user);

    // 1件目が届いた時点で画面が進む。全部届いてからではない。
    expect(await screen.findByText("実測 111ms")).toBeInTheDocument();
    expect(screen.getAllByLabelText("完了")).toHaveLength(1);
    expect(screen.queryByText("実測 222ms")).not.toBeInTheDocument();

    first.open();

    expect(await screen.findByText("実測 222ms")).toBeInTheDocument();
    expect(screen.getAllByLabelText("完了")).toHaveLength(2);

    second.open();

    expect(
      await screen.findByRole("heading", { name: "自由入力のシェフ の Chef Passport" }),
    ).toBeInTheDocument();
    // タイムラインはダッシュボードに置き換わる。
    expect(screen.queryByText("実測 222ms")).not.toBeInTheDocument();
  });

  it("完了した結果は3カ国そろったダッシュボードとして出る", async () => {
    scriptEvents([{ _tag: "Completed", result: RESULT }]);

    const user = userEvent.setup();
    renderWithMantine(<FreeInputPassport available {...REFERENCE} />);
    await submitResume(user);

    expect(await screen.findByRole("heading", { name: "シンガポール" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "オーストラリア" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "アメリカ" })).toBeInTheDocument();
  });
});

describe("FreeInputPassport — 失敗の3経路", () => {
  it("Failed イベントはそのまま画面に出し、入力は消さない", async () => {
    scriptEvents([
      started("extract"),
      { _tag: "Failed", messageJa: "スキル抽出の生成に失敗しました", step: "extract" },
    ]);

    const user = userEvent.setup();
    renderWithMantine(<FreeInputPassport available {...REFERENCE} />);
    await submitResume(user);

    expect(await screen.findByText("スキル抽出の生成に失敗しました")).toBeInTheDocument();
    // やり直せることが失敗表示の役目なので、フォームは残る。
    expect(screen.getByRole("button", { name: "この経歴で判定する" })).toBeEnabled();
  });

  it("鍵が無いままの送信は、サーバーの型付き拒否をそのまま表示する", async () => {
    scriptEvents([
      {
        _tag: "Failed",
        messageJa: "サーバーにAPIキーが設定されていないため、自由入力は利用できません。",
        step: "guard",
      },
    ]);

    const user = userEvent.setup();
    renderWithMantine(<FreeInputPassport available {...REFERENCE} />);
    await submitResume(user);

    expect(await screen.findByText(/APIキーが設定されていない/)).toBeInTheDocument();
  });

  it("リクエストが届かなければ、退避先が無いことを含めて伝える", async () => {
    transport.open = () => Promise.reject(new Error("network down"));

    const user = userEvent.setup();
    renderWithMantine(<FreeInputPassport available {...REFERENCE} />);
    await submitResume(user);

    // プリセットと違い、他人の経歴文にキャッシュ再生の退避先はない。
    expect(await screen.findByText(/退避先がない/)).toBeInTheDocument();
  });
});

describe("FreeInputPassport — 縮退", () => {
  it("説明文だけ落ちた完了は、結果を出したうえで縮退を明示する", async () => {
    scriptEvents([
      {
        _tag: "Completed",
        degraded: {
          messageJa:
            "説明文の生成に失敗したため、決定論ロジックが組み立てた説明文に切り替えました。",
          reason: "prose-failed",
        },
        result: RESULT,
      },
    ]);

    const user = userEvent.setup();
    renderWithMantine(<FreeInputPassport available {...REFERENCE} />);
    await submitResume(user);

    expect(await screen.findByText(/決定論ロジックが組み立てた説明文/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "自由入力のシェフ の Chef Passport" }),
    ).toBeInTheDocument();
  });
});
