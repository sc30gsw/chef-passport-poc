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
 */
export const PipelineDegradation = Schema.Struct({
  messageJa: Schema.String,
  reason: Schema.Literal("live-failed", "no-key", "in-flight"),
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
    /** Set by the transport, never by a Layer — the Layers do not know what was asked for. */
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
