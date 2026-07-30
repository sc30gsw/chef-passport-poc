import { Box, Text } from "@mantine/core";

/**
 * Rendered from `__root.tsx` so that no screen can ship without it. The PoC presents mock
 * visa figures and mock job listings; omitting this is a legal-risk problem, not a UI nit.
 */
export function DemoDisclaimerBanner() {
  return (
    <Box bg="orange.1" c="orange.9" className="px-4 py-2" role="note">
      <Text size="sm" className="text-center">
        ※ 本デモのビザ要件・求人情報はすべて<strong>デモ用のモックデータ</strong>
        です。法的助言ではありません。各ビザカードには実在の出典URLを併記しています。
      </Text>
    </Box>
  );
}
