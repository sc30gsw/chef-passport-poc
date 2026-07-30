import { Button, Checkbox, NumberInput, Paper, Radio, Stack, Textarea, Title } from "@mantine/core";
import { Either, Schema } from "effect";
import type { FormEvent } from "react";
import { useState } from "react";

import { LANGUAGE_LABELS_JA, LANGUAGE_LEVEL_ORDER } from "~/domain/language-level";
import type { FreeInputRequest } from "~/features/passport/types/free-input-request";
import {
  FreeInputRequest as FreeInputRequestSchema,
  MAX_AGE_YEARS,
  MAX_RESUME_LENGTH,
  MIN_AGE_YEARS,
  MIN_RESUME_LENGTH,
} from "~/features/passport/types/free-input-request";

const decodeRequest = Schema.decodeUnknownEither(FreeInputRequestSchema);

/**
 * The draft is one value rather than four `useState` calls: the four fields are decoded together as
 * a single request, so they change together and there is nothing to gain from separate renders.
 *
 * Nothing is pre-filled. `age` and `languageLevel` are judgement inputs — the 417 age cap fires on
 * one and 30% of the visa fit score rides on the other — so a default would be the form quietly
 * deciding something the user never declared. See types/free-input-request.ts.
 */
const EMPTY_DRAFT = {
  age: "" as number | string,
  hasEvidenceProof: false,
  languageLevel: "",
  resume: "",
};

type Draft = typeof EMPTY_DRAFT;

function resumeErrorJa(resume: string, showRequired: boolean) {
  if (resume.length > MAX_RESUME_LENGTH) {
    return `上限を${resume.length - MAX_RESUME_LENGTH}文字超えています`;
  }

  return showRequired && resume.length < MIN_RESUME_LENGTH
    ? `${MIN_RESUME_LENGTH}文字以上入力してください`
    : undefined;
}

function ageErrorJa(age: number | string, showRequired: boolean) {
  if (!showRequired) return undefined;
  if (typeof age !== "number" || !Number.isInteger(age)) return "年齢を整数で入力してください";

  return age < MIN_AGE_YEARS || age > MAX_AGE_YEARS
    ? `年齢は${MIN_AGE_YEARS}〜${MAX_AGE_YEARS}の範囲で入力してください`
    : undefined;
}

/**
 * Screen 1's other entrance. The résumé is prose the model reads; everything beside it is a
 * judgement input the form declares, which is why they are separate controls rather than things the
 * extraction is asked to guess.
 *
 * The cap shown here is a courtesy — `FreeInputRequest` is the enforcement, and the same decode runs
 * again on the server, where a caller who skipped this form cannot reach around it. See
 * .claude/rules/common/security.md.
 *
 * No `Modal` and no `Popover`: `@mantine/hooks` #9078 is open in 9.5.0 and pins `useEffectEvent`
 * hooks (click-outside, collapse) to the first render. `Radio.Group` needs neither.
 */
export function FreeInputForm({
  onSubmit,
  pending,
}: {
  readonly onSubmit: (request: FreeInputRequest) => void;
  readonly pending: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [attempted, setAttempted] = useState(false);

  const remaining = MAX_RESUME_LENGTH - draft.resume.length;
  const overCap = remaining < 0;

  function update(patch: Partial<Draft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);

    // The schema decides, not the field-level messages above it: those exist to say *what* to fix.
    const decoded = decodeRequest(draft);
    if (Either.isRight(decoded)) onSubmit(decoded.right);
  }

  return (
    <Paper withBorder p="lg" radius="md" component="section">
      <Title order={2} size="h4" mb="md">
        経歴を入力してください
      </Title>

      {/* `noValidate` because the schema is the gate: native constraint validation would silently
          block submission before `handleSubmit` runs, and would say so in the browser's own English
          rather than in the field messages below. */}
      <form noValidate onSubmit={handleSubmit}>
        <Stack gap="md">
          {/* Fixed rows rather than `autosize`: Mantine's autosize path reads
              `ownerDocument.defaultView` on mount, which happy-dom does not provide, so the
              component test cannot render it at all. */}
          <Textarea
            required
            rows={8}
            label="経歴・職務内容"
            description={`残り${remaining}文字（${MIN_RESUME_LENGTH}〜${MAX_RESUME_LENGTH}文字）`}
            placeholder="担当した料理、使ってきた技法、勤務先の業態や年数などを日本語で書いてください。"
            value={draft.resume}
            error={resumeErrorJa(draft.resume, attempted)}
            onChange={(event) => update({ resume: event.currentTarget.value })}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <NumberInput
              required
              allowDecimal={false}
              allowNegative={false}
              min={MIN_AGE_YEARS}
              max={MAX_AGE_YEARS}
              label="年齢"
              description="ワーキングホリデーの年齢上限判定に使います。"
              value={draft.age}
              error={ageErrorJa(draft.age, attempted)}
              onChange={(age) => update({ age })}
            />

            <Checkbox
              mt="xl"
              label="受賞歴・メディア掲載などの実績証明がある"
              description="米国 O-1 の必須要件です。チェックしない場合は「主張なし」として判定します。"
              checked={draft.hasEvidenceProof}
              onChange={(event) => update({ hasEvidenceProof: event.currentTarget.checked })}
            />
          </div>

          <Radio.Group
            required
            label="英語レベル（自己申告）"
            description="経歴文の記述ではなく、この申告値で判定します。"
            value={draft.languageLevel}
            error={
              attempted && draft.languageLevel === "" ? "英語レベルを選択してください" : undefined
            }
            onChange={(languageLevel) => update({ languageLevel })}
          >
            <Stack gap="xs" mt="xs">
              {LANGUAGE_LEVEL_ORDER.map((level) => (
                <Radio key={level} value={level} label={LANGUAGE_LABELS_JA[level]} />
              ))}
            </Stack>
          </Radio.Group>

          <Button type="submit" disabled={pending || overCap} loading={pending}>
            {pending ? "判定中です" : "この経歴で判定する"}
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
