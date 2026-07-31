import { Effect, Exit } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { loadJobs, loadPersona, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import type { PassportInputs } from "~/features/passport/api/build-passport";
import { runPassportPipeline } from "~/features/passport/api/pipeline-service";
import { passportPipelineFromCache, passportPipelineLive } from "~/lib/runtime";

const visas = Effect.runSync(loadVisaRequirements);
const jobs = Effect.runSync(loadJobs);
const vocabulary = Effect.runSync(loadSkillVocabulary);

function inputsFor(personaId: string): PassportInputs {
  return { jobs, persona: Effect.runSync(loadPersona(personaId)), visas, vocabulary };
}

describe("passportPipelineFromCache", () => {
  it("プリセットはこの合成点だけを通ってタグから解決される", async () => {
    const exit = await Effect.runPromiseExit(
      runPassportPipeline(inputsFor("suzuki-haruka")).pipe(
        Effect.provide(passportPipelineFromCache({ paced: false })),
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(Exit.isSuccess(exit) ? exit.value.personaId : "").toBe("suzuki-haruka");
  });

  it("3人ぶんのキャッシュがこの Layer 経由で引ける", async () => {
    const ids = ["sato-takumi", "suzuki-haruka", "takahashi-kenta"];

    const resolved = await Promise.all(
      ids.map((id) =>
        Effect.runPromise(
          runPassportPipeline(inputsFor(id)).pipe(
            Effect.provide(passportPipelineFromCache({ paced: false })),
          ),
        ),
      ),
    );

    expect(resolved.map((result) => result.personaId)).toStrictEqual(ids);
  });
});

describe("passportPipelineLive", () => {
  it("合成しただけでは鍵もネットワークも触らない", () => {
    // 鍵は Layer が *ビルド* される時点で初めて読まれる。ここで例外や通信が起きるなら、
    // ハンドラ内で呼ぶ意味がなくなる（モジュールスコープで鍵に触れるのと同じ問題）。
    // See .claude/rules/common/security.md.
    expect(() => passportPipelineLive()).not.toThrow();
  });
});
