import { Alert, Anchor, Container, Stack } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { loadPassportServer } from "~/features/passport/api/passport-server";
import { CachedPassport } from "~/features/passport/components/cached-passport";
import { LivePassport } from "~/features/passport/components/live-passport";

/**
 * `?live=true` carries the home page's toggle across the navigation, so a shared or reloaded URL
 * shows the same thing it did when it was opened. TanStack parses the value for us, but a
 * hand-typed URL can still deliver the string, so both are decoded.
 */
const PassportSearch = Schema.Struct({
  live: Schema.optionalWith(
    Schema.transform(Schema.Union(Schema.Boolean, Schema.String), Schema.Boolean, {
      decode: (raw) => raw === true || raw === "true",
      encode: (live) => live,
    }),
    { default: () => false },
  ),
});

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
  validateSearch: (search: Record<string, unknown>) =>
    Schema.decodeUnknownSync(PassportSearch)(search),
  loader: ({ params }) => loadPassportServer({ data: { personaId: params.personaId } }),
  component: PassportPage,
});

function PassportPage() {
  const loaded = Route.useLoaderData();
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

        {live ? <LivePassport fallbackView={loaded.data} /> : <CachedPassport view={loaded.data} />}
      </Stack>
    </Container>
  );
}
