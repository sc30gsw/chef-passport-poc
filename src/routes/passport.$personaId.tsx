import { Alert, Anchor, Container, Stack } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";

import { loadJobs, loadVisaRequirements } from "~/data/loaders";
import { loadPassportServer } from "~/features/passport/api/passport-server";
import { CachedPassport } from "~/features/passport/components/cached-passport";
import { LivePassport } from "~/features/passport/components/live-passport";
import { decodeLiveSearch } from "~/features/passport/types/live-search";

/**
 * Screens 2 and 3 share one route. The transition reads better as a collapse than as a navigation,
 * and no in-flight replay state is thrown away mid-way.
 *
 * The loader runs in both modes on purpose. Live generation needs a result to fall back to when the
 * request itself never lands, and the cached run is in-memory and unpaced — cheap enough that
 * holding it ready costs less than a screen with nothing to show.
 */
export const Route = createFileRoute("/passport/$personaId")({
  // Property order is load-bearing: TanStack Router feeds each one into the next's inference.
  validateSearch: (search: Record<string, unknown>) => decodeLiveSearch(search),
  loader: async ({ params }) => ({
    // Bundled JSON, so this resolves on both sides of the hydration boundary. Loading it here
    // rather than inside `LivePassport` keeps the decode out of a render body.
    jobs: Effect.runSync(loadJobs),
    passport: await loadPassportServer({ data: { personaId: params.personaId } }),
    visas: Effect.runSync(loadVisaRequirements),
  }),
  component: PassportPage,
});

function PassportPage() {
  const { jobs, passport: loaded, visas } = Route.useLoaderData();
  const { live } = Route.useSearch();

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

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Anchor component={Link} to="/">
          ← シェフ選択に戻る
        </Anchor>

        {live === true ? (
          <LivePassport fallbackView={loaded.data} jobs={jobs} visas={visas} />
        ) : (
          <CachedPassport view={loaded.data} />
        )}
      </Stack>
    </Container>
  );
}
