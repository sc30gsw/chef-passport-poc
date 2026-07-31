import { Loader, Paper, Text, ThemeIcon, Title, VisuallyHidden } from "@mantine/core";

import type { PipelineStep } from "~/data/schemas";
import { STEP_LABELS_JA, STEP_ORDER } from "~/features/passport/types/pipeline-event";
import type { PipelineRunState } from "~/features/passport/utils/pipeline-run-state";

const STEP_STATUS_JA = {
  active: "処理中",
  done: "完了",
  waiting: "待機中",
} as const;

type StepStatus = keyof typeof STEP_STATUS_JA;

function stepStatus(index: number, completedCount: number): StepStatus {
  if (index < completedCount) return "done";

  return index === completedCount ? "active" : "waiting";
}

/** What a screen reader hears when the list changes, since the icons carry the state visually. */
function progressSentenceJa(completedCount: number) {
  const current = STEP_ORDER[completedCount] as PipelineStep | undefined;

  return current === undefined
    ? `AI処理が完了しました（${STEP_ORDER.length}ステップ）`
    : `${STEP_ORDER.length}ステップ中${completedCount}ステップ完了。現在: ${STEP_LABELS_JA[current]}`;
}

/**
 * Screen 2 — the quiet lead. It shows what the system asks the model to do and what it decides
 * itself, which is the design argument the whole demo is making.
 *
 * Purely presentational, and deliberately so: progress arrives as `PipelineRunState`, which cached
 * replay and live streaming both produce, so this component never learns which one is driving it.
 *
 * The state of each step is carried in **text**, not only in an icon and a colour. `ThemeIcon`
 * renders a `div` and `Loader` an `svg`; neither has a role that supports an accessible name, so
 * the `aria-label`s they used to carry were never announced. The icons are decorative now and each
 * item names its own state, with one polite live region for the change itself. See audit #15
 * finding 6.
 */
export function PipelineTimeline({
  completedCount,
  timings,
}: Pick<PipelineRunState, "completedCount" | "timings">) {
  return (
    // `aria-busy` says the region is still changing, so a screen reader can hold off on reading a
    // half-built list. It clears on the last step, which is also the moment `PassportDashboard`
    // replaces this component and takes focus. See audit #17 finding 7.
    <Paper withBorder p="lg" radius="md" aria-busy={completedCount < STEP_ORDER.length}>
      <Title order={2} size="h4" mb="md">
        AI処理の進行状況
      </Title>

      {/* `output` rather than `role="status"`: same implicit role, and jsx-a11y insists on the
          semantic element. */}
      <VisuallyHidden component="output" aria-live="polite">
        {progressSentenceJa(completedCount)}
      </VisuallyHidden>

      <ol className="flex list-none flex-col gap-3 p-0">
        {STEP_ORDER.map((step, index) => {
          const status = stepStatus(index, completedCount);
          const measured = timings.find((timing) => timing.step === step);

          return (
            <li
              key={step}
              aria-label={`${index + 1}. ${STEP_LABELS_JA[step]}: ${STEP_STATUS_JA[status]}`}
              className="flex items-center gap-3"
            >
              {status === "done" ? (
                <ThemeIcon aria-hidden color="green" radius="xl" size="sm">
                  <span>✓</span>
                </ThemeIcon>
              ) : status === "active" ? (
                <Loader aria-hidden size="sm" />
              ) : (
                <ThemeIcon aria-hidden color="gray" radius="xl" size="sm" variant="light">
                  <span>·</span>
                </ThemeIcon>
              )}
              <Text
                c={status === "done" ? undefined : "dimmed"}
                fw={status === "active" ? 600 : 400}
              >
                {index + 1}. {STEP_LABELS_JA[step]}
              </Text>
              {status === "done" && measured !== undefined ? (
                <Text c="dimmed" size="xs">
                  実測 {Math.round(measured.durationMs)}ms
                </Text>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Paper>
  );
}
