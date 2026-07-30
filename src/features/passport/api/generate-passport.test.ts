import type { LanguageModel } from "@effect/ai";
import { Layer, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { lookupCachedPassport } from "~/data/cache-index";
import type { PassportPipelineLayers } from "~/features/passport/api/generate-passport";
import { streamPassportEvents } from "~/features/passport/api/generate-passport";
import { PipelineLive, pipelineFromCache } from "~/features/passport/api/pipeline-service";
import { presetSingleFlight } from "~/features/passport/api/single-flight";
import { PipelineEvent } from "~/features/passport/types/pipeline-event";
import {
  STUB_RESPONSES,
  countingModelLayer,
  failingModelLayer,
  gatedModelLayer,
  stubModelLayer,
} from "~/testing/stub-language-model";

const decodeEvent = Schema.decodeUnknownSync(PipelineEvent);

/** Unpaced in tests: pacing is `pipeline-service.test.ts`' subject, and 4 × 800ms per run is not. */
const cacheLayer: PassportPipelineLayers["cache"] = () =>
  pipelineFromCache(lookupCachedPassport, { paced: false });

function liveLayer(
  model: Layer.Layer<LanguageModel.LanguageModel>,
): PassportPipelineLayers["live"] {
  return () => PipelineLive.pipe(Layer.provide(model));
}

async function collect(
  personaId: string,
  live: boolean,
  model: Layer.Layer<LanguageModel.LanguageModel>,
) {
  const received: PipelineEvent[] = [];

  for await (const event of streamPassportEvents(
    { live, personaId },
    { cache: cacheLayer, live: liveLayer(model) },
  )) {
    received.push(decodeEvent(event));
  }

  return received;
}

function terminal(events: readonly PipelineEvent[]) {
  const last = events.at(-1);
  return last?._tag === "Completed" ? last : undefined;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const id of ["sato-takumi", "suzuki-haruka", "takahashi-kenta"]) {
    presetSingleFlight.release(id);
  }
});

describe("streamPassportEvents — ライブ要求あり", () => {
  it("鍵があってモデルが応答すれば、ライブ結果を degraded なしで返す", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");

    const events = await collect("sato-takumi", true, stubModelLayer(STUB_RESPONSES));
    const completed = terminal(events);

    expect(completed?.result.proseSource).toBe("llm");
    expect(completed?.degraded).toBeUndefined();
    expect(completed?.result.countries.every((c) => c.explanationJa === "スタブの説明文")).toBe(
      true,
    );
  });

  it("モデルが落ち続けたら、キャッシュを最初から流し直して degraded を明示する", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");

    const events = await collect("sato-takumi", true, failingModelLayer());
    const completed = terminal(events);

    expect(completed?.degraded?.reason).toBe("live-failed");
    expect(completed?.degraded?.messageJa).toContain("最初から再生");
    expect(completed?.result).toStrictEqual(lookupCachedPassport("sato-takumi"));
  });

  it("フォールバックは途中結果を捨て、1ステップ目からやり直す", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");

    const events = await collect("sato-takumi", true, failingModelLayer());
    const started = events.flatMap((event) => (event._tag === "StepStarted" ? [event.step] : []));

    // ライブが extract で落ちるので、その1件のあとにキャッシュ再生の4件が続く。
    expect(started).toStrictEqual(["extract", "extract", "visa", "translate", "match"]);
  });

  it("鍵がなければモデルには一切触れず、キャッシュ再生になる", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const model = countingModelLayer();

    const events = await collect("sato-takumi", true, model.layer);
    const completed = terminal(events);

    expect(model.calls.count).toBe(0);
    expect(completed?.degraded?.reason).toBe("no-key");
    expect(completed?.result).toStrictEqual(lookupCachedPassport("sato-takumi"));
  });

  it("同じペルソナが実行中なら、待たせずに in-flight として拒否する", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const model = countingModelLayer();

    expect(presetSingleFlight.acquire("sato-takumi")).toBe(true);
    const events = await collect("sato-takumi", true, model.layer);
    const completed = terminal(events);

    expect(model.calls.count).toBe(0);
    expect(completed?.degraded?.reason).toBe("in-flight");
  });

  it("実行が終われば単一実行のスロットは解放される", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");

    await collect("sato-takumi", true, stubModelLayer(STUB_RESPONSES));

    expect(presetSingleFlight.acquire("sato-takumi")).toBe(true);
  });
});

describe("streamPassportEvents — ライブ要求なし", () => {
  it("モデルには触れず、degraded も付けない", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const model = countingModelLayer();

    const events = await collect("sato-takumi", false, model.layer);
    const completed = terminal(events);

    expect(model.calls.count).toBe(0);
    expect(completed?.degraded).toBeUndefined();
    expect(completed?.result).toStrictEqual(lookupCachedPassport("sato-takumi"));
  });

  it("鍵がない環境でも、プリセット3人はキャッシュだけで完走する", async () => {
    // #2 の恒久的な回帰ライン。鍵なし・ネットワークなしでデモが動くことがこの案件の前提。
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const model = countingModelLayer();

    for (const id of ["sato-takumi", "suzuki-haruka", "takahashi-kenta"]) {
      const events = await collect(id, false, model.layer);

      expect(events.map((event) => event._tag)).toStrictEqual([
        "StepStarted",
        "StepCompleted",
        "StepStarted",
        "StepCompleted",
        "StepStarted",
        "StepCompleted",
        "StepStarted",
        "StepCompleted",
        "Completed",
      ]);
      expect(terminal(events)?.result).toStrictEqual(lookupCachedPassport(id));
    }

    expect(model.calls.count).toBe(0);
  });

  it("存在しないペルソナは Failed イベントになり、例外は投げない", async () => {
    const events = await collect("nope", false, stubModelLayer(STUB_RESPONSES));

    expect(events.map((event) => event._tag)).toStrictEqual(["Failed"]);
    expect(events[0]?._tag === "Failed" ? events[0].messageJa : "").toContain("nope");
  });
});

describe("streamPassportEvents — 逐次配信", () => {
  it("生成が終わる前にイベントが届く（TanStack/router#7529 に対する証拠）", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");

    let openGate = () => {};
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });

    const received: PipelineEvent[] = [];
    let finished = false;

    const drained = (async () => {
      for await (const event of streamPassportEvents(
        { live: true, personaId: "sato-takumi" },
        {
          cache: cacheLayer,
          live: liveLayer(gatedModelLayer("translations", gate, STUB_RESPONSES)),
        },
      )) {
        received.push(decodeEvent(event));
      }
      finished = true;
    })();

    // 抽出開始・抽出完了・ビザ開始・ビザ完了・翻訳開始 の5件は、翻訳が止まっている間に届く。
    while (received.length < 5) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(finished).toBe(false);
    expect(received.map((event) => event._tag)).toStrictEqual([
      "StepStarted",
      "StepCompleted",
      "StepStarted",
      "StepCompleted",
      "StepStarted",
    ]);

    openGate();
    await drained;

    expect(finished).toBe(true);
    expect(terminal(received)?.result.proseSource).toBe("llm");
  });
});
