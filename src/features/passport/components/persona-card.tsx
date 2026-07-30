import { Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";

import type { Persona } from "~/data/schemas";
import { LANGUAGE_LABELS_JA } from "~/domain/language-level";
import { GENRE_LABELS_JA } from "~/features/passport/utils/labels";

/** Screen 1. The interviewer picks one, which turns the demo into a conversation. */
export function PersonaCard({ persona }: Record<"persona", Persona>) {
  return (
    <Card withBorder padding="lg" radius="md" component="article">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Title order={2} size="h4">
            {persona.name}
          </Title>
          <Text c="dimmed" size="sm">
            {persona.age}歳
          </Text>
        </Group>

        <Group gap="xs">
          <Badge color="orange" variant="light">
            {GENRE_LABELS_JA[persona.primaryGenre]}
          </Badge>
          <Badge color="blue" variant="light">
            経験{persona.experienceYears}年
          </Badge>
          <Badge color="grape" variant="light">
            語学: {LANGUAGE_LABELS_JA[persona.languageLevel]}
          </Badge>
        </Group>

        <Text lineClamp={4} size="sm" c="dimmed">
          {persona.resumeJa}
        </Text>

        {/* `renderRoot` rather than `component={Link}`: the polymorphic `component` prop erases
            TanStack Router's route generics, so typed `params` stops type-checking. */}
        <Button
          fullWidth
          mt="sm"
          renderRoot={(props) => (
            <Link {...props} to="/passport/$personaId" params={{ personaId: persona.id }} />
          )}
        >
          {persona.name}で判定する
        </Button>
      </Stack>
    </Card>
  );
}
