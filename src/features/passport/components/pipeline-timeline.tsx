import { Loader, Paper, Text, ThemeIcon, Title } from "@mantine/core";

import { STEP_LABELS_JA, STEP_ORDER } from "~/features/passport/types/pipeline-event";
import type { PipelineRunState } from "~/features/passport/utils/pipeline-run-state";

/**
 * Screen 2 — the quiet lead. It shows what the system asks the model to do and what it decides
 * itself, which is the design argument the whole demo is making.
 *
 * Purely presentational, and deliberately so: progress arrives as `PipelineRunState`, which cached
 * replay and live streaming both produce, so this component never learns which one is driving it.
 */
export function PipelineTimeline({
  completedCount,
  timings,
}: Pick<PipelineRunState, "completedCount" | "timings">) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Title order={2} size="h4" mb="md">
        AI処理の進行状況
      </Title>
      <ol className="flex list-none flex-col gap-3 p-0">
        {STEP_ORDER.map((step, index) => {
          const isDone = index < completedCount;
          const isActive = index === completedCount;
          const measured = timings.find((timing) => timing.step === step);

          return (
            <li key={step} className="flex items-center gap-3">
              {isDone ? (
                <ThemeIcon color="green" radius="xl" size="sm" aria-label="完了">
                  <span aria-hidden="true">✓</span>
                </ThemeIcon>
              ) : isActive ? (
                <Loader size="sm" aria-label="処理中" />
              ) : (
                <ThemeIcon color="gray" radius="xl" size="sm" variant="light" aria-label="待機中">
                  <span aria-hidden="true">·</span>
                </ThemeIcon>
              )}
              <Text c={isDone ? undefined : "dimmed"} fw={isActive ? 600 : 400}>
                {index + 1}. {STEP_LABELS_JA[step]}
              </Text>
              {isDone && measured !== undefined ? (
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
