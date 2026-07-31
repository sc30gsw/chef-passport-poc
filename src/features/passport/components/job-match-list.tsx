import { Badge, Button, Card, Group, List, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";

import type { PassportView } from "~/features/passport/api/passport-server";

const TOP_MATCH_COUNT = 5;

/** Thresholds, named. They are a presentation choice, not a judgement — the score is the judgement. */
const STRONG_MATCH_SCORE = 70;
const FAIR_MATCH_SCORE = 50;

/**
 * Mapping a judgement to a colour the way `country-grade-card.tsx` does, rather than as a nested
 * ternary inside a JSX prop. Two idioms for the same job in adjacent files was audit #15's
 * finding 15; a lookup table is not available here because the input is a range, not a union.
 */
function matchScoreColor(score: number) {
  if (score >= STRONG_MATCH_SCORE) return "green";

  return score >= FAIR_MATCH_SCORE ? "blue" : "gray";
}

type JobMatchListProps = {
  excludedJobs: PassportView["excludedJobs"];
  jobMatches: PassportView["jobMatches"];
};

/**
 * Excluded jobs are collapsed behind a count rather than dropped. Plain `useState` instead of
 * Mantine's `Collapse`: `@mantine/hooks` #9078 pins `use-collapse` to first render inside
 * `forwardRef`/`memo`, and a control that will not open during a live demo is the worst available
 * failure mode. See .claude/rules/web/mantine-tailwind.md.
 */
export function JobMatchList({ excludedJobs, jobMatches }: JobMatchListProps) {
  const [showExcluded, setShowExcluded] = useState(false);
  const top = jobMatches.slice(0, TOP_MATCH_COUNT);

  return (
    <Paper withBorder p="lg" radius="md" component="section">
      <Title order={2} size="h4" mb="md">
        求人マッチ（上位{top.length}件 / 全{jobMatches.length}件）
      </Title>

      <Stack gap="sm">
        {top.map(({ job, match }) => (
          <Card key={job.id} withBorder padding="md" radius="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Text fw={600} size="sm">
                {job.titleJa}
              </Text>
              <Badge color={matchScoreColor(match.score)}>{match.score} / 100</Badge>
            </Group>

            <Text c="dimmed" size="xs" mt={2}>
              {job.city} ・ {job.salary.amount.toLocaleString("en-US")} {job.salary.currency}/
              {job.salary.period === "month" ? "月" : "年"} ・ スポンサー
              {job.sponsorshipAvailable ? "可" : "不可"}
            </Text>

            <Text size="sm" mt={6}>
              {match.reasonJa}
            </Text>

            {match.notesJa.length > 0 ? (
              <List size="xs" mt={4} c="dimmed">
                {/* The sentence is the key. Safe because every `notesJa` push in
                    `src/domain/scoring.ts` sits in a distinct branch writing a distinct sentence,
                    so one list cannot hold duplicates. Restated here because the guarantee lives
                    in another module; an index key is the alternative react-doctor rejects. */}
                {match.notesJa.map((note) => (
                  <List.Item key={note}>{note}</List.Item>
                ))}
              </List>
            ) : null}
          </Card>
        ))}
      </Stack>

      {excludedJobs.length > 0 ? (
        <Stack gap="xs" mt="md">
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowExcluded((previous) => !previous)}
            aria-expanded={showExcluded}
          >
            除外 {excludedJobs.length} 件（理由を{showExcluded ? "隠す" : "見る"}）
          </Button>

          {showExcluded ? (
            <Stack gap="xs">
              {excludedJobs.map(({ job, reasonJa }) => (
                <Card key={job.id} withBorder padding="sm" radius="sm" bg="gray.0">
                  <Text size="sm" fw={600}>
                    {job.titleJa}
                  </Text>
                  <Text size="xs" c="red.8" mt={2}>
                    {reasonJa}
                  </Text>
                </Card>
              ))}
            </Stack>
          ) : null}
        </Stack>
      ) : null}
    </Paper>
  );
}
