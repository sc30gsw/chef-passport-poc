import { Schema } from "effect";

import { PassportResult, PipelineStep } from "~/data/schemas";

/**
 * Progress events are ours, not the model's — `@effect/ai` has no progress API. Preset replay and
 * live generation expose the *same* `Stream<PipelineEvent>`; only the Layer differs, so the
 * timeline component never branches on which source is active.
 */
/**
 * Why the run is not what was asked for. Closed decision #6 puts degradation in a
 * `{ result, degraded? }` wrapper rather than in `PassportResult`: `proseSource` records how the
 * *wording* was produced and must keep meaning only that, so a cache replay that stands in for a
 * failed live run still reports the `proseSource` its cache file carries.
 *
 * Absent means the run did what the caller asked, which is the only silent case.
 *
 * The first three belong to preset generation, where a downgrade means the committed cache stood in
 * for a live run. `prose-failed` is free input's: there is no cache for a stranger's résumé, so the
 * only thing a failed wording step can fall back to is `deterministicProse`, and this is what says
 * so out loud.
 */
const PipelineDegradation = Schema.Struct({
  messageJa: Schema.String,
  reason: Schema.Literal("live-failed", "no-key", "in-flight", "prose-failed"),
});
export type PipelineDegradation = Schema.Schema.Type<typeof PipelineDegradation>;

export const PipelineEvent = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("StepStarted"),
    labelJa: Schema.String,
    step: PipelineStep,
  }),
  Schema.Struct({
    _tag: Schema.Literal("StepCompleted"),
    durationMs: Schema.Number,
    step: PipelineStep,
  }),
  Schema.Struct({
    _tag: Schema.Literal("Completed"),
    /**
     * Set by whichever side knows. The transport owns the preset reasons — only it knows the run
     * was asked for live and got the cache — while the free-input Layer owns `prose-failed`,
     * because the substitution happens inside the run and nothing outside it can see that.
     */
    degraded: Schema.optional(PipelineDegradation),
    result: PassportResult,
  }),
  /**
   * Failures travel in-band rather than in the Stream's error channel. A server function must
   * return plain serializable data — an `Effect` failure, a `Cause` or a `TaggedError` is not
   * serializable — so the stream's error channel stays `never` and the UI reads this variant.
   */
  Schema.Struct({
    _tag: Schema.Literal("Failed"),
    messageJa: Schema.String,
    step: Schema.String,
  }),
);
export type PipelineEvent = Schema.Schema.Type<typeof PipelineEvent>;

/** What travels on the wire: encoded on the server, decoded again on the client. */
export type EncodedPipelineEvent = Schema.Schema.Encoded<typeof PipelineEvent>;

/**
 * Shared by both streaming transports — preset generation and free input — so the two cannot drift
 * into encoding the same union differently. See .claude/rules/typescript/effect-schema.md.
 */
export const encodePipelineEvent = Schema.encodeSync(PipelineEvent);

/** Screen 2's four lines. */
export const STEP_LABELS_JA = {
  extract: "スキルを抽出・構造化しています",
  match: "海外求人とマッチング・スコアリングしています",
  translate: "スキル表現を現地の厨房用語に変換しています",
  visa: "国別のビザ要件と照合しています",
} as const satisfies Record<PipelineStep, string>;

/** Presentation order, independent of the alphabetised keys above. */
export const STEP_ORDER = [
  "extract",
  "visa",
  "translate",
  "match",
] as const satisfies readonly PipelineStep[];
