import { Alert, Anchor, Container, Stack } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";

import type { PassportView } from "~/features/passport/api/passport-server";
import { loadPassportServer } from "~/features/passport/api/passport-server";
import { PassportDashboard } from "~/features/passport/components/passport-dashboard";
import { PipelineTimeline } from "~/features/passport/components/pipeline-timeline";
import { usePipelineReplay } from "~/features/passport/hooks/use-pipeline-replay";

/**
 * Screens 2 and 3 share one route. The transition reads better as a collapse than as a navigation,
 * and no in-flight replay state is thrown away mid-way.
 */
export const Route = createFileRoute("/passport/$personaId")({
  component: PassportPage,
  loader: ({ params }) => loadPassportServer({ data: { personaId: params.personaId } }),
});

function PassportPage() {
  const loaded = Route.useLoaderData();

  if (!loaded.ok) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" title="読み込みに失敗しました">
          {loaded.message}
          <Anchor component={Link} to="/" display="block" mt="sm">
            シェフ選択に戻る
          </Anchor>
        </Alert>
      </Container>
    );
  }

  return <PassportContent view={loaded.data} />;
}

/** Split out so the replay hook only mounts once the view data exists. */
function PassportContent({ view }: Record<"view", PassportView>) {
  const { isComplete } = usePipelineReplay({ timings: view.timings });

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Anchor component={Link} to="/">
          ← シェフ選択に戻る
        </Anchor>

        {isComplete ? (
          <PassportDashboard view={view} />
        ) : (
          <PipelineTimeline timings={view.timings} />
        )}
      </Stack>
    </Container>
  );
}
