import { describe, expect, it } from "vite-plus/test";

import { gatewayFallbackOptions, modelRoleConfig } from "~/lib/ai-client";
import { EXTRACTION_MODEL, MODEL_ROLES, PROSE_MODEL } from "~/lib/model-roles";

/**
 * `gatewayFallbackOptions` returns a deliberately opaque type — the cast that lets an off-schema
 * field through lives there and nowhere else — so these assertions read the value back through
 * `unknown` rather than adding a second cast to reach into it.
 *
 * The gateway's own half of the contract (`providerMetadata.modelAttempts[]` recording the
 * attempts) needs a real call and belongs to #11's runbook. What can be pinned here is the shape
 * that leaves this process.
 */
describe("gatewayFallbackOptions", () => {
  it("ゲートウェイが読むトップレベルの providerOptions.gateway.models を組み立てる", () => {
    const options: unknown = gatewayFallbackOptions([PROSE_MODEL]);

    expect(options).toStrictEqual({
      providerOptions: { gateway: { models: [PROSE_MODEL] } },
    });
  });

  it("フォールバック先が空でもキー自体は残す。落とすとゲートウェイ側の既定に戻ってしまう", () => {
    const options: unknown = gatewayFallbackOptions([]);

    expect(options).toStrictEqual({ providerOptions: { gateway: { models: [] } } });
  });
});

describe("MODEL_ROLES", () => {
  it("抽出・翻訳は haiku-4.5、説明文は sonnet-5", () => {
    expect(MODEL_ROLES.extraction.model).toBe("anthropic/claude-haiku-4.5");
    expect(MODEL_ROLES.prose.model).toBe("anthropic/claude-sonnet-5");
  });

  it("スラッグはすべてプロバイダ接頭辞つき。接頭辞なしはゲートウェイで404になる", () => {
    const slugs = Object.values(MODEL_ROLES).flatMap((role) => [role.model, ...role.fallbacks]);

    expect(slugs).not.toHaveLength(0);
    expect(slugs.every((slug) => slug.startsWith("anthropic/"))).toBe(true);
  });

  it("各ロールのフォールバックはもう一方のモデル。自分自身には退避しない", () => {
    expect(MODEL_ROLES.extraction.fallbacks).toStrictEqual([PROSE_MODEL]);
    expect(MODEL_ROLES.prose.fallbacks).toStrictEqual([EXTRACTION_MODEL]);
    expect(MODEL_ROLES.extraction.fallbacks).not.toContain(EXTRACTION_MODEL);
    expect(MODEL_ROLES.prose.fallbacks).not.toContain(PROSE_MODEL);
  });
});

describe("modelRoleConfig", () => {
  it("説明文ロールのリクエストには haiku へのフォールバックが載る", () => {
    const config: unknown = modelRoleConfig("prose");

    expect(config).toStrictEqual({
      providerOptions: { gateway: { models: [EXTRACTION_MODEL] } },
    });
  });

  it("抽出ロールのリクエストには sonnet へのフォールバックが載る", () => {
    const config: unknown = modelRoleConfig("extraction");

    expect(config).toStrictEqual({
      providerOptions: { gateway: { models: [PROSE_MODEL] } },
    });
  });
});
