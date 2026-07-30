import { Anchor, Badge, Card, Group, List, Stack, Text, Title } from "@mantine/core";

import type { Grade } from "~/data/schemas";
import type { PassportView } from "~/features/passport/api/passport-server";
import { COUNTRY_LABELS_JA } from "~/features/passport/utils/labels";

const GRADE_COLORS = {
  "◎": "green",
  "○": "blue",
  "△": "orange",
} as const satisfies Record<Grade, string>;

type CountryGradeCardProps = {
  country: PassportView["countries"][number];
};

/**
 * A △ card must name the constraint it violated. That visible reason is the proof the deterministic
 * logic exists — a bare grade would be indistinguishable from model output.
 */
export function CountryGradeCard({ country }: CountryGradeCardProps) {
  return (
    <Card withBorder padding="lg" radius="md" component="section">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={3} size="h4">
            {COUNTRY_LABELS_JA[country.country]}
          </Title>
          {/* An accessible name rather than a bare glyph: "◎" alone is meaningless to a screen
              reader, and it also gives tests a precise handle without a forbidden data-testid. */}
          <Badge
            aria-label={`${COUNTRY_LABELS_JA[country.country]}の適合度 ${country.grade}`}
            color={GRADE_COLORS[country.grade]}
            size="lg"
            variant="filled"
          >
            {country.grade}
          </Badge>
        </Group>

        <Text size="sm">{country.explanationJa}</Text>

        <Stack gap="xs" mt="xs">
          {country.visaRequirements.map((requirement) => {
            const assessment = country.visas.find((visa) => visa.visaId === requirement.id);

            return (
              <Card key={requirement.id} withBorder padding="sm" radius="sm" bg="gray.0">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Text fw={600} size="sm">
                    {requirement.name}
                  </Text>
                  <Badge color={assessment?.eligible === true ? "green" : "gray"} variant="light">
                    {assessment?.eligible === true ? "クリア" : "対象外"}
                  </Badge>
                </Group>

                <Text c="dimmed" size="xs" mt={4}>
                  {requirement.durationNote}
                </Text>

                <Group gap="xs" mt={6}>
                  {requirement.minSalary !== undefined ? (
                    <Badge size="xs" variant="outline">
                      給与下限 {requirement.minSalary.amount.toLocaleString("en-US")}{" "}
                      {requirement.minSalary.currency}/
                      {requirement.minSalary.period === "month" ? "月" : "年"}
                    </Badge>
                  ) : null}
                  <Badge size="xs" variant="outline">
                    経験{requirement.minExperienceYears}年以上
                  </Badge>
                  <Badge size="xs" variant="outline">
                    スポンサー{requirement.requiresSponsor ? "要" : "不要"}
                  </Badge>
                  {requirement.maxAgeYears !== undefined ? (
                    <Badge size="xs" variant="outline">
                      {requirement.maxAgeYears}歳以下
                    </Badge>
                  ) : null}
                </Group>

                {assessment !== undefined && assessment.blockedReasonsJa.length > 0 ? (
                  <List size="xs" mt={6} c="red.8">
                    {assessment.blockedReasonsJa.map((reason) => (
                      <List.Item key={reason}>{reason}</List.Item>
                    ))}
                  </List>
                ) : null}

                <Anchor
                  href={requirement.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  size="xs"
                  mt={6}
                  display="block"
                >
                  出典（公式ページ）
                </Anchor>
              </Card>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}
