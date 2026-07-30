import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import { LANGUAGE_LABELS_JA } from "~/domain/language-level";
import type { PassportView } from "~/features/passport/api/passport-server";
import { CountryGradeCard } from "~/features/passport/components/country-grade-card";
import { JobMatchList } from "~/features/passport/components/job-match-list";
import { TranslatedSkills } from "~/features/passport/components/translated-skills";
import { GENRE_LABELS_JA } from "~/features/passport/utils/labels";

/** Screen 3 — the main build. */
export function PassportDashboard({ view }: Record<"view", PassportView>) {
  return (
    <Stack gap="lg">
      <Paper withBorder p="lg" radius="md" component="header">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1} size="h3">
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
        <Title order={2} size="h4" mb="sm">
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
