import { Alert, Anchor, Container, List, Stack, Text, Title } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { isFreeInputEnabled } from "~/lib/runtime";

/**
 * The flag is read on the server, inside the handler — never at module scope, and never with a
 * `VITE_` prefix, which would ship it to the browser. Free-input mode calls a paid API from a public
 * URL, so it defaults off and the preset personas work without it.
 */
const readFreeInputFlagServer = createServerFn({ method: "GET" }).handler(() => ({
  enabled: isFreeInputEnabled(),
}));

export const Route = createFileRoute("/free")({
  component: FreePage,
  loader: () => readFreeInputFlagServer(),
});

function FreePage() {
  const { enabled } = Route.useLoaderData();

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Anchor component={Link} to="/">
          ← シェフ選択に戻る
        </Anchor>

        <Title order={1} size="h3">
          自由入力モード
        </Title>

        {enabled ? (
          <Alert color="blue" title="準備中" variant="light">
            フラグは有効ですが、入力フォームとライブ生成の配線はこのブランチには入っていません。
            プリセット3人はキャッシュ再生で完全に動作します。
          </Alert>
        ) : (
          <Alert color="gray" title="現在は無効です" variant="light">
            <Text size="sm">
              自由入力は公開URLから有料APIを呼ぶため、サーバー側フラグ
              <code>ENABLE_FREE_INPUT</code>{" "}
              で既定OFFにしています。有効化には3つのガードが揃っている必要があります。
            </Text>
            <List size="sm" mt="sm">
              <List.Item>サーバー側フラグ（既定OFF）</List.Item>
              <List.Item>スキーマレベルの文字数上限</List.Item>
              <List.Item>AI Gateway ダッシュボードの利用上限</List.Item>
            </List>
          </Alert>
        )}

        <Text c="dimmed" size="sm">
          プリセットのシェフは事前生成キャッシュから再生されるため、APIキーもネットワークも不要です。
        </Text>
      </Stack>
    </Container>
  );
}
