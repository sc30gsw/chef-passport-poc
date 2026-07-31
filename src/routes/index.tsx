import {
  Anchor,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { Link, createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { valibotValidator } from "@tanstack/valibot-adapter";
import { Effect } from "effect";

import { loadPersonas } from "~/data/loaders";
import { PersonaCard } from "~/features/passport/components/persona-card";
import { defaultLiveSearchParams, liveSearchSchema } from "~/features/passport/types/live-search";

/**
 * Screen 1. The personas come from bundled JSON, so this loader is safe on both sides of the
 * hydration boundary and needs no server round trip.
 *
 * The mode lives in the URL here too, not in `useState`: the passport screen already persists it
 * that way, and two homes for one fact meant pressing Back from a live run turned the switch off.
 */
export const Route = createFileRoute("/")({
  // Property order is load-bearing: TanStack Router feeds each one into the next's inference.
  validateSearch: valibotValidator(liveSearchSchema),
  search: {
    middlewares: [stripSearchParams(defaultLiveSearchParams)],
  },
  loader: () => ({ personas: Effect.runSync(loadPersonas) }),
  component: Home,
});

function Home() {
  const { personas } = Route.useLoaderData();
  const { live } = Route.useSearch();
  const navigate = Route.useNavigate();

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

        {/* One switch for the whole screen, not one per card: the mode is a property of the demo
            being given, not of the chef being picked. Off by default — a demo that starts spending
            money the moment it loads is the wrong default. */}
        <Paper withBorder p="md" radius="md">
          <Switch
            checked={live}
            onChange={(event) =>
              // `false` is the default — `stripSearchParams` drops it so the URL stays clean.
              navigate({ search: { live: event.currentTarget.checked } })
            }
            label="ライブ生成（AIを実際に呼ぶ）"
            description="オフのときは事前生成キャッシュを再生します。APIキーが無いサーバーでは自動的にキャッシュ再生に切り替わり、画面にその旨を表示します。"
          />
        </Paper>

        <section>
          <Title order={2} size="h4" mb="sm">
            シェフを選んでください
          </Title>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            {personas.map((persona) => (
              <PersonaCard key={persona.id} live={live} persona={persona} />
            ))}
          </SimpleGrid>
        </section>
      </Stack>
    </Container>
  );
}
