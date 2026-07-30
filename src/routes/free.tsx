import { Alert, Anchor, Container, List, Stack, Text, Title } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

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

export const Route = createFileRoute("/free")({
  component: FreePage,
  loader: () => readFreeInputAvailabilityServer(),
});

function FreePage() {
  const { available } = Route.useLoaderData();

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Anchor component={Link} to="/">
          ← シェフ選択に戻る
        </Anchor>

        <Title order={1} size="h3">
          自由入力モード
        </Title>

        {available ? (
          <Alert color="blue" title="準備中" variant="light">
            <Text size="sm">
              サーバーにAPIキーがあるため、自由入力のライブ生成は利用可能な状態です。
              サーバー関数とスキーマは実装済みですが、入力フォームはこのブランチにはまだ入っていません。
              プリセット3人はキャッシュ再生で完全に動作します。
            </Text>
          </Alert>
        ) : (
          <Alert color="gray" title="現在は利用できません" variant="light">
            <Text size="sm">
              自由入力は公開URLから有料APIを呼ぶため、サーバー側で
              <code>AI_GATEWAY_API_KEY</code>
              の有無だけを見て判定します。キーが未設定の環境では、モデルを呼ぶ前に型付きの拒否を返します。
            </Text>
          </Alert>
        )}

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
