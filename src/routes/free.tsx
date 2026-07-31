import { Anchor, Container, List, Stack, Text, Title } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";

import { loadJobs, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import { FreeInputPassport } from "~/features/passport/components/free-input-passport";
import { MAX_RESUME_LENGTH } from "~/features/passport/types/free-input-request";
import { hasGatewayKey } from "~/lib/gateway-key";

/**
 * Key presence is read on the server, inside the handler — never at module scope, and never with a
 * `VITE_` prefix, which would ship the key itself to the browser. The page learns only whether live
 * generation is possible, which is a boolean, not a secret.
 *
 * There is no feature flag: `ENABLE_FREE_INPUT` was abolished by the owner on 2026-07-30 in favour
 * of gating on `AI_GATEWAY_API_KEY` alone. See .claude/rules/common/security.md.
 */
const readFreeInputAvailabilityServer = createServerFn({ method: "GET" }).handler(() => ({
  available: hasGatewayKey(),
}));

/**
 * The bundled reference data is joined here rather than inside the component: the loader is the
 * composition layer, and decoding in a render body re-runs the decode on every streamed event.
 */
export const Route = createFileRoute("/free")({
  component: FreePage,
  loader: async () => ({
    ...(await readFreeInputAvailabilityServer()),
    jobs: Effect.runSync(loadJobs),
    visas: Effect.runSync(loadVisaRequirements),
    vocabulary: Effect.runSync(loadSkillVocabulary),
  }),
});

function FreePage() {
  const { available, jobs, visas, vocabulary } = Route.useLoaderData();

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Anchor component={Link} to="/">
          ← シェフ選択に戻る
        </Anchor>

        <Title order={1} size="h3">
          自由入力モード
        </Title>

        <FreeInputPassport
          available={available}
          jobs={jobs}
          visas={visas}
          vocabulary={vocabulary}
        />

        <Text fw={600} size="sm">
          自由入力に必要な3つのガード
        </Text>
        <List size="sm">
          <List.Item>サーバー側のキー有無判定（フラグは廃止）</List.Item>
          <List.Item>スキーマレベルの文字数上限（{MAX_RESUME_LENGTH}文字）</List.Item>
          <List.Item>AI Gateway ダッシュボードの利用上限</List.Item>
        </List>

        <Text c="dimmed" size="sm">
          プリセットのシェフは事前生成キャッシュから再生されるため、APIキーもネットワークも不要です。
        </Text>
      </Stack>
    </Container>
  );
}
