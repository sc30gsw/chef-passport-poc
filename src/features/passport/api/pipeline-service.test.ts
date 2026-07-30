import { LanguageModel } from "@effect/ai";
import { Cause, Context, Effect, Exit, Layer, Option, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { lookupCachedPassport } from "~/data/cache-index";
import { loadJobs, loadPersona, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import type { PassportResult } from "~/data/schemas";
import type { PassportInputs } from "~/features/passport/api/build-passport";
import {
  PassportPipeline,
  PipelineLive,
  clampReplayMs,
  pipelineFromCache,
  runPassportPipeline,
} from "~/features/passport/api/pipeline-service";
import type { PipelineEvent } from "~/features/passport/types/pipeline-event";

const visas = Effect.runSync(loadVisaRequirements);
const jobs = Effect.runSync(loadJobs);
const vocabulary = Effect.runSync(loadSkillVocabulary);
const persona = Effect.runSync(loadPersona("sato-takumi"));

const inputs: PassportInputs = { jobs, persona, visas, vocabulary };

const cachedSato = lookupCachedPassport("sato-takumi");
if (cachedSato === undefined) throw new Error("sato-takumi のキャッシュが読めない");

/** The pipeline forks a producer fibre and sleeps between replay steps, so it cannot run synchronously. */
function collect(layer: Layer.Layer<PassportPipeline>): Promise<readonly PipelineEvent[]> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const pipeline = yield* PassportPipeline;
      const events = yield* Stream.runCollect(pipeline.run(inputs));
      return [...events];
    }).pipe(Effect.provide(layer), Effect.scoped),
  );
}

/** Same tag, either Layer — which is the whole point of folding the run in one place. */
function foldToResult(layer: Layer.Layer<PassportPipeline>) {
  return Effect.runPromiseExit(runPassportPipeline(inputs).pipe(Effect.provide(layer)));
}

async function elapsedMs(work: () => Promise<unknown>): Promise<number> {
  const startedAt = performance.now();
  await work();
  return performance.now() - startedAt;
}

/**
 * Swap the model, keep the pipeline. The real API is never called from a test — the point of these is
 * that the *structure* runs, since the judgement it wraps is already covered by the domain tests.
 *
 * `generateObject` is the only method the four steps use, so the stub implements just that. The cast
 * is confined to this helper rather than spread across the tests.
 */
function stubModelLayer(byObjectName: Readonly<Record<string, unknown>>) {
  const service = {
    generateObject: ({ objectName }: { objectName?: string }) =>
      Effect.succeed({ value: byObjectName[objectName ?? ""] }),
  } as unknown as Context.Tag.Service<LanguageModel.LanguageModel>;

  return Layer.succeed(LanguageModel.LanguageModel, service);
}

/** Fails the first `failures` calls, then behaves like the stub — a transient gateway blip. */
function flakyModelLayer(failures: number, byObjectName: Readonly<Record<string, unknown>>) {
  let remaining = failures;

  const service = {
    generateObject: ({ objectName }: { objectName?: string }) => {
      if (remaining > 0) {
        remaining -= 1;
        return Effect.fail(new Error("transient"));
      }
      return Effect.succeed({ value: byObjectName[objectName ?? ""] });
    },
  } as unknown as Context.Tag.Service<LanguageModel.LanguageModel>;

  return Layer.succeed(LanguageModel.LanguageModel, service);
}

const STUB_RESPONSES = {
  countryExplanation: { explanationJa: "スタブの説明文" },
  jobMatchReason: { reasonJa: "スタブの理由文" },
  skillSet: {
    experienceYears: 8,
    languageLevel: "conversational",
    primaryGenre: "sushi",
    skills: ["sashimi-slicing", "yanagiba-knife"],
    summaryJa: "スタブの要約",
  },
  translations: {
    translations: [
      {
        localEn: "Slicing white-fish sashimi",
        skillId: "sashimi-slicing",
        sourceJa: "白身の刺身引き",
      },
    ],
  },
} as const;

describe("clampReplayMs", () => {
  it.each([
    [0, 800],
    [500, 800],
    [1500, 1500],
    [9000, 2500],
  ])("実測 %i ms は %i ms に丸められる", (measured, expected) => {
    expect(clampReplayMs(measured)).toBe(expected);
  });
});

describe("PipelineFromCache", () => {
  it("4ステップぶんの開始・完了イベントを順に流し、最後に結果を返す", async () => {
    const events = await collect(pipelineFromCache(lookupCachedPassport, { paced: false }));

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
  });

  it("StepCompleted には丸める前の実測値がそのまま載る", async () => {
    const events = await collect(pipelineFromCache(lookupCachedPassport, { paced: false }));
    const completed = events.flatMap((event) =>
      event._tag === "StepCompleted" ? [event.durationMs] : [],
    );

    expect(completed).toStrictEqual(cachedSato.timings.map((timing) => timing.durationMs));
  });

  it("キャッシュにないペルソナは Failed イベントになり、例外は投げない", async () => {
    const events = await collect(pipelineFromCache(() => undefined));

    expect(events.map((event) => event._tag)).toStrictEqual(["Failed"]);
  });

  it("最後の Completed が事前生成結果をそのまま運ぶ", async () => {
    const events = await collect(pipelineFromCache(lookupCachedPassport, { paced: false }));
    const last = events.at(-1);

    expect(last?._tag).toBe("Completed");
    expect(last?._tag === "Completed" ? last.result.personaId : "").toBe("sato-takumi");
  });
});

describe("PipelineFromCache の再生ペーシング", () => {
  const oneStep: PassportResult = { ...cachedSato, timings: [{ durationMs: 10, step: "extract" }] };

  it("既定では実測値を丸めた時間だけ待ってから StepCompleted を流す", async () => {
    const measured = await elapsedMs(() => collect(pipelineFromCache(() => oneStep)));

    // 実測 10ms は下限 800ms に丸められる。タイマー粒度ぶんの余裕をみて 700ms で判定する。
    expect(measured).toBeGreaterThanOrEqual(700);
  });

  it("paced: false は待たない。イベントの中身は同じ", async () => {
    const measured = await elapsedMs(() =>
      collect(pipelineFromCache(() => oneStep, { paced: false })),
    );

    expect(measured).toBeLessThan(400);
  });
});

describe("runPassportPipeline", () => {
  it("キャッシュ層でもライブ層でも、同じタグから同じ PassportResult に畳み込まれる", async () => {
    const fromCache = await foldToResult(pipelineFromCache(lookupCachedPassport, { paced: false }));
    const fromLive = await foldToResult(
      PipelineLive.pipe(Layer.provide(stubModelLayer(STUB_RESPONSES))),
    );

    expect(Exit.isSuccess(fromCache)).toBe(true);
    expect(Exit.isSuccess(fromLive)).toBe(true);
    if (!Exit.isSuccess(fromCache) || !Exit.isSuccess(fromLive)) return;

    expect(fromCache.value.personaId).toBe(fromLive.value.personaId);
    // 判定は同じで、由来だけが違う。これが差し替え可能であることの証拠になる。
    expect(fromCache.value.countries.map((country) => country.grade)).toStrictEqual(
      fromLive.value.countries.map((country) => country.grade),
    );
    expect(fromLive.value.proseSource).toBe("llm");
  });

  it("Failed イベントは PipelineError になり、日本語メッセージを持ち越す", async () => {
    const exit = await foldToResult(pipelineFromCache(() => undefined));

    expect(Exit.isSuccess(exit)).toBe(false);
    if (Exit.isSuccess(exit)) return;

    const failure = Cause.failureOption(exit.cause);

    expect(Option.isSome(failure)).toBe(true);
    expect(Option.isSome(failure) ? failure.value._tag : "").toBe("PipelineError");
    expect(Option.isSome(failure) ? failure.value.messageJa : "").toContain(
      "事前生成結果が見つかりません",
    );
  });
});

describe("PipelineLive（スタブモデル）", () => {
  const layer = PipelineLive.pipe(Layer.provide(stubModelLayer(STUB_RESPONSES)));

  it("ステップの順序は 抽出 → ビザ → 翻訳 → マッチング", async () => {
    const events = await collect(layer);
    const started = events.flatMap((event) => (event._tag === "StepStarted" ? [event.step] : []));

    expect(started).toStrictEqual(["extract", "visa", "translate", "match"]);
  });

  it("最後に Completed を返し、文章はLLM由来として記録される", async () => {
    const events = await collect(layer);
    const last = events.at(-1);

    expect(last?._tag).toBe("Completed");
    expect(last?._tag === "Completed" ? last.result.proseSource : "").toBe("llm");
  });

  it("判定はモデルではなくドメインロジックが決める", async () => {
    const events = await collect(layer);
    const last = events.at(-1);
    const result = last?._tag === "Completed" ? last.result : undefined;

    // スタブが返すのは説明文だけ。等級はドメイン再計算と一致していなければならない。
    expect(result?.countries.map((country) => country.grade)).toStrictEqual(
      cachedSato.countries.map((country) => country.grade),
    );
  });

  it("説明文と理由文にはモデル出力が入る", async () => {
    const events = await collect(layer);
    const last = events.at(-1);
    const result = last?._tag === "Completed" ? last.result : undefined;

    expect(result?.countries.every((country) => country.explanationJa === "スタブの説明文")).toBe(
      true,
    );
    expect(result?.jobMatches.every((match) => match.reasonJa === "スタブの理由文")).toBe(true);
  });

  it("一時的な失敗はリトライで吸収され、Completed まで進む", async () => {
    const events = await collect(
      PipelineLive.pipe(Layer.provide(flakyModelLayer(1, STUB_RESPONSES))),
    );

    expect(events.at(-1)?._tag).toBe("Completed");
  });

  it("モデルが落ち続けたら、そのステップ名つきの Failed イベントになる", async () => {
    const failing = Layer.succeed(LanguageModel.LanguageModel, {
      generateObject: () => Effect.fail(new Error("boom")),
    } as unknown as Context.Tag.Service<LanguageModel.LanguageModel>);

    const events = await collect(PipelineLive.pipe(Layer.provide(failing)));
    const last = events.at(-1);

    expect(last?._tag).toBe("Failed");
    expect(last?._tag === "Failed" ? last.step : "").toBe("extract");
    expect(last?._tag === "Failed" ? last.messageJa : "").toBe("スキル抽出の生成に失敗しました");
  });
});
