import type { Country, Money, VenueType } from "~/data/schemas";

/**
 * Market shape shared by visa eligibility and job scoring. Everything here is mock demo data;
 * the figures were tuned until `expected-outcomes.test.ts` passed, which is the intended
 * direction of causality — the outcome table is fixed, these numbers move.
 */

/** Visa floors and job salaries are always in the same currency per country, so no FX is needed. */
export function toMonthlyAmount(money: Money): number {
  return money.period === "year" ? money.amount / 12 : money.amount;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Years of experience that read as a strong candidate. A visa demanding more raises the bar. */
export const EXPERIENCE_BENCHMARK_YEARS = 8;

/**
 * Salary headroom above a visa's wage floor that earns full marks. Clearing the floor by a hair
 * is a materially weaker position than clearing it by half again, and grading on headroom rather
 * than on pass/fail is what stops a low-floor visa from outscoring a demanding one.
 */
export const SALARY_HEADROOM_TARGET = 0.5;

/**
 * Fit awarded to a visa with no wage floor. A working-holiday visa lets you work but carries no
 * employer wage guarantee, so "no floor" must not mean "free marks".
 */
export const NO_FLOOR_SALARY_FIT = 0.25;

/** Reference monthly salary for a well-paid chef role, in each country's own currency. */
export const COUNTRY_REFERENCE_MONTHLY = {
  AU: 8000,
  SG: 7500,
  US: 7500,
} as const satisfies Record<Country, number>;

/**
 * Relative demand for each cuisine per market, 0-1. Singapore's high-end omakase scene is deeper
 * than Australia's, which skews casual — and ramen is the reverse.
 */
export const GENRE_DEMAND = {
  AU: { bistro: 0.6, french: 0.6, hotel_japanese: 0.5, kaiseki: 0.25, ramen: 0.9, sushi: 0.3 },
  SG: { bistro: 0.6, french: 0.7, hotel_japanese: 0.8, kaiseki: 0.9, ramen: 0.5, sushi: 1.0 },
  US: { bistro: 0.5, french: 0.6, hotel_japanese: 0.4, kaiseki: 0.4, ramen: 0.8, sushi: 0.9 },
} as const satisfies Record<Country, Record<VenueType, number>>;

/** Adjacent venue types earn partial genre credit in job scoring. */
export const GENRE_FAMILY = {
  bistro: "western",
  french: "western",
  hotel_japanese: "japanese",
  kaiseki: "japanese",
  ramen: "japanese",
  sushi: "japanese",
} as const satisfies Record<VenueType, "japanese" | "western">;
