import { Either, Schema } from "effect";
import { ArrayFormatter } from "effect/ParseResult";

import type { LanguageLevel } from "~/data/schemas";
import type { FreeInputRequest } from "~/features/passport/types/free-input-request";
import {
  FreeInputRequest as FreeInputRequestSchema,
  MAX_AGE_YEARS,
  MAX_RESUME_LENGTH,
  MIN_AGE_YEARS,
  MIN_RESUME_LENGTH,
} from "~/features/passport/types/free-input-request";

/**
 * The free-input form's draft and everything that judges it. Lifted out of the component so it can
 * be tested directly — a component file may not export a non-component (`only-export-components`),
 * and the divergence this module guards against is not reachable through the rendered controls.
 *
 * The draft is one value rather than four `useState` calls: the four fields are decoded together as
 * a single request, so they change together and there is nothing to gain from separate renders.
 *
 * Nothing is pre-filled. `age` and `languageLevel` are judgement inputs — the 417 age cap fires on
 * one and 30% of the visa fit score rides on the other — so a default would be the form quietly
 * deciding something the user never declared. See types/free-input-request.ts.
 *
 * The empty states are `""` rather than a widened `string`/`number | string`: the draft can then
 * only hold a value the domain accepts or nothing at all, instead of holding anything and waiting
 * for the submit-time decode to notice.
 */
export type FreeInputDraft = {
  readonly age: number | "";
  readonly hasEvidenceProof: boolean;
  readonly languageLevel: LanguageLevel | "";
  readonly resume: string;
};

export const EMPTY_DRAFT: FreeInputDraft = {
  age: "",
  hasEvidenceProof: false,
  languageLevel: "",
  resume: "",
};

const decodeDraft = Schema.decodeUnknownEither(FreeInputRequestSchema);

export function resumeErrorJa(resume: string, showRequired: boolean) {
  if (resume.length > MAX_RESUME_LENGTH) {
    return `上限を${resume.length - MAX_RESUME_LENGTH}文字超えています`;
  }

  return showRequired && resume.length < MIN_RESUME_LENGTH
    ? `${MIN_RESUME_LENGTH}文字以上入力してください`
    : undefined;
}

export function ageErrorJa(age: number | "", showRequired: boolean) {
  if (!showRequired) return undefined;
  if (age === "" || !Number.isInteger(age)) return "年齢を整数で入力してください";

  return age < MIN_AGE_YEARS || age > MAX_AGE_YEARS
    ? `年齢は${MIN_AGE_YEARS}〜${MAX_AGE_YEARS}の範囲で入力してください`
    : undefined;
}

export function languageLevelErrorJa(languageLevel: LanguageLevel | "", showRequired: boolean) {
  return showRequired && languageLevel === "" ? "英語レベルを選択してください" : undefined;
}

/** The schema decides. `Right` means the request the server will see, byte for byte. */
export function decodeFreeInputDraft(
  draft: FreeInputDraft,
): Either.Either<FreeInputRequest, string[]> {
  return decodeDraft(draft).pipe(
    Either.mapLeft((error) =>
      ArrayFormatter.formatErrorSync(error).map((issue) =>
        issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`,
      ),
    ),
  );
}
