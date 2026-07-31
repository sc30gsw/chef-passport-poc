import {
  Alert,
  Button,
  Checkbox,
  List,
  NumberInput,
  Paper,
  Radio,
  Stack,
  Textarea,
  Title,
} from "@mantine/core";
import type { FormEvent } from "react";
import { useState } from "react";

import { LANGUAGE_LABELS_JA, LANGUAGE_LEVEL_ORDER } from "~/domain/language-level";
import type { FreeInputRequest } from "~/features/passport/types/free-input-request";
import {
  MAX_AGE_YEARS,
  MAX_RESUME_LENGTH,
  MIN_AGE_YEARS,
  MIN_RESUME_LENGTH,
} from "~/features/passport/types/free-input-request";
import type { FreeInputDraft } from "~/features/passport/utils/free-input-draft";
import {
  EMPTY_DRAFT,
  ageErrorJa,
  decodeFreeInputDraft,
  languageLevelErrorJa,
  resumeErrorJa,
} from "~/features/passport/utils/free-input-draft";

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
}: Record<"onSubmit", (request: FreeInputRequest) => void> & Record<"pending", boolean>) {
  const [draft, setDraft] = useState<FreeInputDraft>(EMPTY_DRAFT);
  const [attempted, setAttempted] = useState(false);

  const remaining = MAX_RESUME_LENGTH - draft.resume.length;
  const overCap = remaining < 0;

  const resumeError = resumeErrorJa(draft.resume, attempted);
  const ageError = ageErrorJa(draft.age, attempted);
  const languageLevelError = languageLevelErrorJa(draft.languageLevel, attempted);

  // The field messages are a hand-maintained superset of the schema, and the schema is what
  // decides. When they disagree — the day the schema gains a constraint they do not mirror — the
  // submit button used to do nothing and say nothing. This is what speaks instead.
  const decoded = attempted ? decodeFreeInputDraft(draft) : undefined;
  const unexplainedIssues =
    decoded !== undefined &&
    !decoded.ok &&
    resumeError === undefined &&
    ageError === undefined &&
    languageLevelError === undefined
      ? decoded.issues
      : [];

  function update(patch: Partial<FreeInputDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);

    // The schema decides, not the field-level messages above it: those exist to say *what* to fix.
    const result = decodeFreeInputDraft(draft);
    if (result.ok) onSubmit(result.request);
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
            // Says out loud which fields the résumé decides. Experience years is a hard visa gate
            // read out of this text, and it is clamped to what the declared age accounts for —
            // a judgement input the reader should know is being extracted. See audit #16 finding 2.
            description={`残り${remaining}文字（${MIN_RESUME_LENGTH}〜${MAX_RESUME_LENGTH}文字）。経験年数・スキル・業態はこの文章から読み取り、経験年数は申告年齢で説明できる範囲に丸めます。`}
            placeholder="担当した料理、使ってきた技法、勤務先の業態や年数などを日本語で書いてください。"
            value={draft.resume}
            error={resumeError}
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
              error={ageError}
              // Mantine hands back a string for a half-typed value. Keeping the draft's own type
              // narrow means the empty case is `""` rather than a widened `number | string`.
              onChange={(age) => update({ age: typeof age === "number" ? age : "" })}
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
            error={languageLevelError}
            // Narrowed by lookup rather than by a cast: the group can only emit one of the four
            // rendered values, and anything else lands back on the empty state.
            onChange={(value) =>
              update({
                languageLevel: LANGUAGE_LEVEL_ORDER.find((level) => level === value) ?? "",
              })
            }
          >
            <Stack gap="xs" mt="xs">
              {LANGUAGE_LEVEL_ORDER.map((level) => (
                <Radio key={level} value={level} label={LANGUAGE_LABELS_JA[level]} />
              ))}
            </Stack>
          </Radio.Group>

          {unexplainedIssues.length === 0 ? null : (
            <Alert color="red" title="入力内容がスキーマ検証を通りませんでした" variant="light">
              <List size="sm">
                {unexplainedIssues.map((issue) => (
                  <List.Item key={issue}>{issue}</List.Item>
                ))}
              </List>
            </Alert>
          )}

          <Button type="submit" disabled={pending || overCap} loading={pending}>
            {pending ? "判定中です" : "この経歴で判定する"}
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
