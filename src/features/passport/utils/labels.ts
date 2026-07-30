import type { Country, VenueType } from "~/data/schemas";

/**
 * Display labels. Kept out of the component files so Fast Refresh can preserve component state —
 * react-doctor's `only-export-components` rule flags a component module that also exports data.
 */
export const GENRE_LABELS_JA = {
  bistro: "ビストロ",
  french: "フレンチ",
  hotel_japanese: "ホテル和食",
  kaiseki: "割烹・懐石",
  ramen: "ラーメン",
  sushi: "寿司",
} as const satisfies Record<VenueType, string>;

export const COUNTRY_LABELS_JA = {
  AU: "オーストラリア",
  SG: "シンガポール",
  US: "アメリカ",
} as const satisfies Record<Country, string>;
