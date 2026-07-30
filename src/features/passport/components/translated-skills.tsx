import { Card, Paper, Stack, Text, Title } from "@mantine/core";

import type { PassportView } from "~/features/passport/api/passport-server";

type TranslatedSkillsProps = {
  translatedSkills: PassportView["translatedSkills"];
  vocabulary: PassportView["vocabulary"];
};

/**
 * The moment a Japanese craft term becomes a phrase a foreign head chef understands. This is the one
 * section that renders English — everything else in the UI is Japanese.
 *
 * When the cache was generated offline there are no translations, so the section explains itself
 * rather than rendering an empty box.
 */
export function TranslatedSkills({ translatedSkills, vocabulary }: TranslatedSkillsProps) {
  return (
    <Paper withBorder p="lg" radius="md" component="section">
      <Title order={2} size="h4" mb="md">
        スキルの現地語翻訳
      </Title>

      {translatedSkills.length === 0 ? (
        <Text c="dimmed" size="sm">
          このプリセットはオフライン生成のため翻訳文がありません。
          <code>vp run generate:passport</code> をゲートウェイ接続ありで実行すると生成されます。
        </Text>
      ) : (
        <Stack gap="xs">
          {translatedSkills.map((skill) => {
            const entry = vocabulary.find((item) => item.id === skill.skillId);

            return (
              <Card key={skill.skillId} withBorder padding="sm" radius="sm">
                <Text size="sm" c="dimmed">
                  {skill.sourceJa || entry?.labelJa}
                </Text>
                <Text size="sm" fw={600} lang="en">
                  {skill.localEn}
                </Text>
              </Card>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
