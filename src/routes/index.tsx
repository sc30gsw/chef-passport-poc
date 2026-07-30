import { Anchor, Container, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";

import { loadPersonas } from "~/data/loaders";
import { PersonaCard } from "~/features/passport/components/persona-card";

/**
 * Screen 1. The personas come from bundled JSON, so this loader is safe on both sides of the
 * hydration boundary and needs no server round trip.
 */
export const Route = createFileRoute("/")({
  component: Home,
  loader: () => ({ personas: Effect.runSync(loadPersonas) }),
});

function Home() {
  const { personas } = Route.useLoaderData();

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Title order={1}>Chef Passport</Title>
            <Text c="dimmed" mt="xs">
              日本人シェフの経歴から、どの国のどの厨房でどのビザなら通用するかを提示します。
              適合判定と求人スコアは決定論的なロジックが決め、AIは言語化のみを担当します。
            </Text>
          </div>
          <Anchor component={Link} to="/free" className="whitespace-nowrap">
            自由入力モード
          </Anchor>
        </Group>

        <section>
          <Title order={2} size="h4" mb="sm">
            シェフを選んでください
          </Title>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            {personas.map((persona) => (
              <PersonaCard key={persona.id} persona={persona} />
            ))}
          </SimpleGrid>
        </section>
      </Stack>
    </Container>
  );
}
