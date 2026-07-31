import {
  Anchor,
  Badge,
  Card,
  Group,
  List,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";

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

type VisaAssessment = PassportView["countries"][number]["visas"][number];

/**
 * Three states, not two. `visaRequirements` comes from the live JSON while `visas` comes from the
 * committed cache, so a visa added without regenerating the cache arrives with **no judgement at
 * all** — and rendering that as a confident 対象外 would be the one screen whose whole argument is
 * auditability asserting something nobody decided. See #21 / audit #15 finding 5.
 */
function assessmentStatus(assessment: VisaAssessment | undefined) {
  if (assessment === undefined) return { color: "gray", labelJa: "判定なし" } as const;

  return assessment.eligible
    ? ({ color: "green", labelJa: "クリア" } as const)
    : ({ color: "gray", labelJa: "対象外" } as const);
}

/**
 * A △ card must name the constraint it violated. That visible reason is the proof the deterministic
 * logic exists — a bare grade would be indistinguishable from model output.
 */
export function CountryGradeCard({ country }: CountryGradeCardProps) {
  return (
    <Card withBorder padding="lg" radius="md" component="section">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={4} size="h4">
            {COUNTRY_LABELS_JA[country.country]}
          </Title>
          {/* The state is carried in **text**, not in an `aria-label`. Mantine's `Badge` renders a
              `div`; ARIA prohibits naming the generic role, so the label this used to carry was
              discarded and the badge was announced as the bare glyph "◎" (audit #17 finding 9).
              `role="img"` would let a label stick but `jsx-a11y/prefer-tag-over-role` rejects it on
              a non-`img` element, so this follows the precedent `pipeline-timeline.tsx` already
              set: hidden text says the whole sentence, the glyph is decorative. */}
          <Badge color={GRADE_COLORS[country.grade]} size="lg" variant="filled">
            <VisuallyHidden>
              {`${COUNTRY_LABELS_JA[country.country]}の適合度 ${country.grade}`}
            </VisuallyHidden>
            <span aria-hidden>{country.grade}</span>
          </Badge>
        </Group>

        <Text size="sm">{country.explanationJa}</Text>

        <Stack gap="xs" mt="xs">
          {country.visaRequirements.map((requirement) => {
            const assessment = country.visas.find((visa) => visa.visaId === requirement.id);
            const status = assessmentStatus(assessment);

            return (
              <Card key={requirement.id} withBorder padding="sm" radius="sm" bg="gray.0">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Text fw={600} size="sm">
                    {requirement.name}
                  </Text>
                  {/* Same treatment as the grade badge above, for the same reason: a lone "対象外"
                      beside three other visas says nothing on its own to a screen reader. */}
                  <Badge color={status.color} variant="light">
                    <VisuallyHidden>{`${requirement.name}の判定 ${status.labelJa}`}</VisuallyHidden>
                    <span aria-hidden>{status.labelJa}</span>
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
                    {/* The sentence is the key. That is safe because every `blockedReasonsJa`
                        push in `src/domain/visa-eligibility.ts` sits in a distinct branch writing
                        a distinct sentence, so one list cannot hold duplicates — a guarantee that
                        lives in another module, restated here because nothing else does. An index
                        key would be the alternative, but react-doctor rejects it outright. */}
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
