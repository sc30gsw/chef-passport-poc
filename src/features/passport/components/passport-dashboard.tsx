import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef } from "react";

import { LANGUAGE_LABELS_JA } from "~/domain/language-level";
import type { PassportView } from "~/features/passport/api/passport-server";
import { CountryGradeCard } from "~/features/passport/components/country-grade-card";
import { JobMatchList } from "~/features/passport/components/job-match-list";
import { TranslatedSkills } from "~/features/passport/components/translated-skills";
import { GENRE_LABELS_JA } from "~/features/passport/utils/labels";

/**
 * Screen 3 — the main build.
 *
 * The heading starts at `h2`: each route owns its own `h1` and this component renders under both
 * of them, so an `h1` here meant a second one on `/free` and none at all on
 * `/passport/$personaId` while the timeline was still running. See audit #17 findings 10 and 11.
 *
 * Focus moves to the header on mount. This component always *replaces* `PipelineTimeline`, and
 * that swap used to drop focus to `<body>` with no announcement — a keyboard user restarted tab
 * order from the top of the document without being told anything had happened (finding 8). The
 * `useEffect` is focus management, not memoisation, so react-compiler has no objection.
 */
export function PassportDashboard({ view }: Record<"view", PassportView>) {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    headerRef.current?.focus();
  }, []);

  return (
    <Stack gap="lg">
      <Paper withBorder p="lg" radius="md" component="header" ref={headerRef} tabIndex={-1}>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} size="h3">
              {view.persona.name} の Chef Passport
            </Title>
            <Group gap="xs" mt="xs">
              <Badge color="orange" variant="light">
                {GENRE_LABELS_JA[view.skillSet.primaryGenre]}
              </Badge>
              <Badge color="blue" variant="light">
                経験{view.skillSet.experienceYears}年
              </Badge>
              <Badge color="grape" variant="light">
                語学: {LANGUAGE_LABELS_JA[view.skillSet.languageLevel]}
              </Badge>
            </Group>
          </div>
        </Group>

        <Text size="sm" mt="sm">
          {view.skillSet.summaryJa}
        </Text>
      </Paper>

      {view.proseSource === "deterministic" ? (
        <Alert color="yellow" title="説明文は決定論的なフォールバックです" variant="light">
          このプリセットはオフラインで生成されたため、説明文と理由文はLLM生成ではなくドメインロジックが組み立てたものです。
          <strong>適合判定とスコアは本番と同一</strong>
          です（判定は決定論、言語化のみLLMという設計のため）。
        </Alert>
      ) : null}

      <section>
        <Title order={3} size="h4" mb="sm">
          国別の適合度
        </Title>
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          {view.countries.map((country) => (
            <CountryGradeCard key={country.country} country={country} />
          ))}
        </SimpleGrid>
      </section>

      <TranslatedSkills translatedSkills={view.translatedSkills} vocabulary={view.vocabulary} />

      <JobMatchList excludedJobs={view.excludedJobs} jobMatches={view.jobMatches} />
    </Stack>
  );
}
