import { Schema } from "effect";

/**
 * `effect/Schema` is the only validator in this project. Types are derived from schemas, never
 * hand-written alongside them. Anything the deterministic functions in `src/domain/` compare is
 * a `Schema.Literal` union rather than `string` — a widened `string` moves the failure from
 * decode time to scoring time, where it silently produces a zero score.
 */

export const Country = Schema.Literal("SG", "AU", "US");
export type Country = Schema.Schema.Type<typeof Country>;

/** Ordered from least to most capable. `src/domain/language-level.ts` owns the ordering. */
export const LanguageLevel = Schema.Literal("none", "basic", "conversational", "business");
export type LanguageLevel = Schema.Schema.Type<typeof LanguageLevel>;

export const VenueType = Schema.Literal(
  "bistro",
  "french",
  "hotel_japanese",
  "kaiseki",
  "ramen",
  "sushi",
);
export type VenueType = Schema.Schema.Type<typeof VenueType>;

/**
 * The single skill vocabulary. Persona skills and job `requiredSkills` both draw from this
 * union, and `src/data/skill-vocabulary.test.ts` asserts the JSON ids match it exactly. String
 * equality across one shared list is the whole reason deterministic skill overlap works.
 */
export const SkillId = Schema.Literal(
  "broth-large-batch",
  "chashu-preparation",
  "dashi-preparation",
  "fish-butchery",
  "inventory-cost-control",
  "kaiseki-course-composition",
  "kitchen-hygiene-haccp",
  "nigiri-forming",
  "noodle-selection",
  "omakase-course-design",
  "pastry-basics",
  "plating-design",
  "sashimi-slicing",
  "sauce-work",
  "seasonal-menu-design",
  "sous-vide",
  "staff-training",
  "store-operations",
  "yanagiba-knife",
);
export type SkillId = Schema.Schema.Type<typeof SkillId>;

export const SkillVocabularyEntry = Schema.Struct({
  id: SkillId,
  labelEn: Schema.String,
  labelJa: Schema.String,
});
export type SkillVocabularyEntry = Schema.Schema.Type<typeof SkillVocabularyEntry>;

export const Money = Schema.Struct({
  amount: Schema.Number.pipe(Schema.positive()),
  currency: Schema.Literal("AUD", "SGD", "USD"),
  period: Schema.Literal("month", "year"),
});
export type Money = Schema.Schema.Type<typeof Money>;

export const VisaRequirement = Schema.Struct({
  country: Country,
  durationNote: Schema.String,
  expectedLanguage: LanguageLevel,
  id: Schema.String,
  /** 417 only. */
  maxAgeYears: Schema.optional(Schema.Number),
  minExperienceYears: Schema.Number,
  /** Absent for visas with no wage floor (417). */
  minSalary: Schema.optional(Money),
  name: Schema.String,
  /** O-1 only. */
  requiresEvidenceProof: Schema.Boolean,
  /** H-2B only: the role itself has to be a temporary/seasonal one. */
  requiresSeasonalRole: Schema.Boolean,
  requiresSponsor: Schema.Boolean,
  sourceUrl: Schema.String,
});
export type VisaRequirement = Schema.Schema.Type<typeof VisaRequirement>;

export const Job = Schema.Struct({
  city: Schema.String,
  country: Country,
  descriptionJa: Schema.String,
  id: Schema.String,
  isSeasonal: Schema.Boolean,
  minExperienceYears: Schema.Number,
  requiredLanguage: LanguageLevel,
  requiredSkills: Schema.Array(SkillId).pipe(Schema.minItems(1)),
  salary: Money,
  sponsorshipAvailable: Schema.Boolean,
  titleJa: Schema.String,
  venueType: VenueType,
});
export type Job = Schema.Schema.Type<typeof Job>;

export const Persona = Schema.Struct({
  /** Required because visa 417 has an age cap; without it that rule cannot fire from data. */
  age: Schema.Number.pipe(Schema.int(), Schema.positive()),
  experienceYears: Schema.Number.pipe(Schema.nonNegative()),
  /** Awards or press coverage, which is what O-1 asks to see evidence of. */
  hasEvidenceProof: Schema.Boolean,
  id: Schema.String,
  languageLevel: LanguageLevel,
  name: Schema.String,
  primaryGenre: VenueType,
  /** The real pipeline input: unstructured Japanese résumé prose. */
  resumeJa: Schema.String,
  skills: Schema.Array(SkillId).pipe(Schema.minItems(1)),
});
export type Persona = Schema.Schema.Type<typeof Persona>;

/** Step 1 output — the LLM's structured reading of the résumé. */
export const SkillSet = Schema.Struct({
  experienceYears: Schema.Number.pipe(Schema.nonNegative()),
  languageLevel: LanguageLevel,
  primaryGenre: VenueType,
  skills: Schema.Array(SkillId),
  summaryJa: Schema.String,
});
export type SkillSet = Schema.Schema.Type<typeof SkillSet>;

/** Step 3 output — Japanese craft vocabulary rendered into a local kitchen's English. */
export const TranslatedSkill = Schema.Struct({
  localEn: Schema.String,
  skillId: SkillId,
  sourceJa: Schema.String,
});
export type TranslatedSkill = Schema.Schema.Type<typeof TranslatedSkill>;

/**
 * Deterministic output of `src/domain/`. There is no ×: `docs/requirement.md` uses three grades,
 * and a △ that names the constraint it violated carries the Working-Holiday narrative.
 */
export const Grade = Schema.Literal("◎", "○", "△");
export type Grade = Schema.Schema.Type<typeof Grade>;

export const VisaAssessment = Schema.Struct({
  /** Empty when eligible. Rendered in the UI — it is the visible proof the logic exists. */
  blockedReasonsJa: Schema.Array(Schema.String),
  eligible: Schema.Boolean,
  score: Schema.Number,
  visaId: Schema.String,
});
export type VisaAssessment = Schema.Schema.Type<typeof VisaAssessment>;

export const CountryAssessment = Schema.Struct({
  bestVisaId: Schema.NullOr(Schema.String),
  country: Country,
  grade: Grade,
  score: Schema.Number,
  /**
   * True when an eligible visa needs no employer sponsor (417). Job matching needs this: a job
   * that will not sponsor is only reachable on a visa that does not require one.
   */
  sponsorFreeEligible: Schema.Boolean,
  visas: Schema.Array(VisaAssessment),
});
export type CountryAssessment = Schema.Schema.Type<typeof CountryAssessment>;

export const JobMatch = Schema.Struct({
  jobId: Schema.String,
  /** Where the score was lost, in Japanese. Deterministic — not LLM prose. */
  notesJa: Schema.Array(Schema.String),
  score: Schema.Number,
});
export type JobMatch = Schema.Schema.Type<typeof JobMatch>;

export const ExcludedJob = Schema.Struct({
  jobId: Schema.String,
  reasonJa: Schema.String,
});
export type ExcludedJob = Schema.Schema.Type<typeof ExcludedJob>;

export const PipelineStep = Schema.Literal("extract", "visa", "translate", "match");
export type PipelineStep = Schema.Schema.Type<typeof PipelineStep>;

/** Measured, not invented: the generator records how long each step actually took. */
export const StepTiming = Schema.Struct({
  durationMs: Schema.Number,
  step: PipelineStep,
});
export type StepTiming = Schema.Schema.Type<typeof StepTiming>;

/** A country assessment plus the one thing the LLM contributes: the sentence. */
export const CountryResult = Schema.Struct({
  ...CountryAssessment.fields,
  explanationJa: Schema.String,
});
export type CountryResult = Schema.Schema.Type<typeof CountryResult>;

export const RankedJobMatch = Schema.Struct({
  ...JobMatch.fields,
  reasonJa: Schema.String,
});
export type RankedJobMatch = Schema.Schema.Type<typeof RankedJobMatch>;

/**
 * The whole pipeline output, and the shape of every file in `src/data/cache/`.
 * `proseSource` records how the wording was produced — a cache file must never be able to
 * pass deterministic fallback text off as model output.
 */
export const PassportResult = Schema.Struct({
  countries: Schema.Array(CountryResult),
  excludedJobs: Schema.Array(ExcludedJob),
  jobMatches: Schema.Array(RankedJobMatch),
  personaId: Schema.String,
  proseSource: Schema.Literal("deterministic", "llm"),
  skillSet: SkillSet,
  timings: Schema.Array(StepTiming),
  translatedSkills: Schema.Array(TranslatedSkill),
});
export type PassportResult = Schema.Schema.Type<typeof PassportResult>;
