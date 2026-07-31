import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { loadJobs, loadPersona, loadSkillVocabulary, loadVisaRequirements } from "~/data/loaders";
import { scoreJobMatch } from "~/domain/scoring";
import { assessAllCountries } from "~/domain/visa-eligibility";
import { explainCountryPrompt } from "~/features/passport/api/steps/explain-country";
import { explainJobMatchPrompt } from "~/features/passport/api/steps/explain-job-match";
import { extractSkillsPrompt } from "~/features/passport/api/steps/extract-skills";
import { translateSkillsPrompt } from "~/features/passport/api/steps/translate-skills";
import { MAX_RESUME_LENGTH } from "~/features/passport/types/free-input-request";

/**
 * The four prompt builders are exported because `.claude/rules/web/ai-pipeline.md` requires it
 * ("prompts live next to their step … as plain exported functions returning a string"), so #13's
 * policy keeps the export and pays for it with this file rather than stripping the keyword.
 *
 * The assertions are worth having on their own: a prompt regression produces plausible-looking
 * wrong output and no failing test anywhere else. The two `explain*` blocks are the highest-value
 * ones — they are a *prompt-level* guard on the deterministic/LLM boundary, complementing the
 * domain tests that guard it at the function level.
 */

const vocabulary = Effect.runSync(loadSkillVocabulary);
const visas = Effect.runSync(loadVisaRequirements);
const jobs = Effect.runSync(loadJobs);
const persona = Effect.runSync(loadPersona("sato-takumi"));

const job = jobs[0];
if (job === undefined) throw new Error("jobs.json が空になっている");

const assessment = assessAllCountries(persona, visas, jobs)[0];
if (assessment === undefined) throw new Error("国別判定が空になっている");

const countryVisas = visas.filter((visa) => visa.country === assessment.country);

/**
 * A ceiling, not a measurement. The résumé is capped at `MAX_RESUME_LENGTH` by schema, and each
 * builder's fixed scaffolding plus the 19-entry vocabulary is well under 4000 characters; anything
 * past this means a builder started inlining data it should be summarising.
 */
const PROMPT_CEILING = MAX_RESUME_LENGTH + 4000;

/** The longest input the schema admits, as one repeated character so it cannot match by accident. */
const MAX_LENGTH_RESUME = "銀".repeat(MAX_RESUME_LENGTH);

describe("extractSkillsPrompt", () => {
  it("語彙IDを1件残らず載せる", () => {
    const prompt = extractSkillsPrompt(persona.resumeJa, vocabulary);

    // 語彙が落ちると抽出は自由文字列になり、下流のスキル一致がすべて0点に退化する。
    for (const entry of vocabulary) expect(prompt).toContain(entry.id);
  });

  it("上限いっぱいの経歴文でもプロンプト長は上限内に収まる", () => {
    const prompt = extractSkillsPrompt(MAX_LENGTH_RESUME, vocabulary);

    expect(prompt.length).toBeLessThan(PROMPT_CEILING);
  });

  it("経歴文は末尾にそのまま1回だけ置かれる", () => {
    const prompt = extractSkillsPrompt(MAX_LENGTH_RESUME, vocabulary);

    // 自由入力が届くのはここだけで、しかも FreeInputRequest でデコード済み。
    // 節を組み立て直したり、指示文に混ぜ込んだりしていないことを固定する。
    expect(prompt.endsWith(`## 経歴文\n${MAX_LENGTH_RESUME}`)).toBe(true);
  });

  it("決定論側が使う制約は経歴文の内容に左右されない", () => {
    const withPersona = extractSkillsPrompt(persona.resumeJa, vocabulary);
    const withMax = extractSkillsPrompt(MAX_LENGTH_RESUME, vocabulary);
    const scaffolding = (prompt: string) => prompt.split("## 経歴文")[0];

    expect(scaffolding(withMax)).toBe(scaffolding(withPersona));
  });
});

describe("translateSkillsPrompt", () => {
  it("渡したスキルを1件ずつ、日本語ラベルつきで載せる", () => {
    const skillIds = vocabulary.map((entry) => entry.id);
    const prompt = translateSkillsPrompt(skillIds, vocabulary);

    for (const entry of vocabulary) {
      expect(prompt).toContain(`- ${entry.id}: ${entry.labelJa}`);
    }
  });

  it("語彙全件を渡してもプロンプト長は上限内に収まる", () => {
    const prompt = translateSkillsPrompt(
      vocabulary.map((entry) => entry.id),
      vocabulary,
    );

    expect(prompt.length).toBeLessThan(PROMPT_CEILING);
  });
});

describe("explainCountryPrompt", () => {
  it("確定した等級をそのまま引用する", () => {
    const prompt = explainCountryPrompt(persona, assessment, countryVisas);

    // ai-pipeline.md の中心規則：判定は決定論、モデルは言い回しだけ。
    // 等級が本文に載っていなければ、モデルは判定を「書かされて」いることになる。
    expect(prompt).toContain(`総合適合度: ${assessment.grade}`);
  });

  it("ビザごとの適否と不適合理由を、確定した内容のまま載せる", () => {
    const prompt = explainCountryPrompt(persona, assessment, countryVisas);

    for (const visa of assessment.visas) {
      const requirement = countryVisas.find((item) => item.id === visa.visaId);
      expect(prompt).toContain(requirement?.name ?? visa.visaId);

      if (visa.eligible) {
        expect(prompt).toContain(`適合（スコア ${visa.score}）`);
        continue;
      }
      for (const reason of visa.blockedReasonsJa) expect(prompt).toContain(reason);
    }
  });

  it("判定を覆さないことを明示的に指示する", () => {
    const prompt = explainCountryPrompt(persona, assessment, countryVisas);

    expect(prompt).toContain("判定結果はすでに確定しています");
    expect(prompt).toContain("判定を覆したり");
  });
});

describe("explainJobMatchPrompt", () => {
  const match = scoreJobMatch(persona, job);

  it("確定したスコアをそのまま引用する", () => {
    const prompt = explainJobMatchPrompt(persona, job, match);

    // 「この15件を0〜100で採点して」との違いがここに出る。点数は入力であって出力ではない。
    expect(prompt).toContain(`## 確定したスコア: ${match.score} / 100`);
    expect(prompt).toContain("スコアを変更したり");
  });

  it("決定論的な減点理由をそのまま載せる", () => {
    const prompt = explainJobMatchPrompt(persona, job, match);

    for (const note of match.notesJa) expect(prompt).toContain(note);
  });

  it("減点項目がなければ、その旨を明示して空欄を残さない", () => {
    const prompt = explainJobMatchPrompt(persona, job, { ...match, notesJa: [] });

    expect(prompt).toContain("（減点項目なし）");
  });

  it("求人と対象シェフの事実だけを載せ、長さは上限内に収まる", () => {
    const prompt = explainJobMatchPrompt(persona, job, match);

    expect(prompt).toContain(job.titleJa);
    expect(prompt).toContain(persona.name);
    expect(prompt.length).toBeLessThan(PROMPT_CEILING);
  });
});
