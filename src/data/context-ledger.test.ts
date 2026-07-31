import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

/**
 * `CONTEXT.md`'s traceability ledger is a document that describes code, so nothing but a test keeps
 * the two in step. Closed decision #19 chose these two checks over a prose-only ledger for that
 * reason, and `src/data/cache-contract.test.ts` is the precedent: a test whose only job is stopping
 * an artifact from drifting from the code it claims to describe. See docs/adr/0004-ssot-ledger.md.
 *
 * Both checks match a symbol name **anywhere** in the file. Asserting on a particular column would
 * pin the ledger's Markdown layout, and the layout is not the thing being guarded — the coverage is.
 */

/**
 * `process.cwd()`, not `import.meta.url`: Vite+ serves test modules over its own dev-server URL, so
 * `fileURLToPath` rejects them. Vitest resolves its root from `vite.config.ts`, so the working
 * directory is the repo root whichever subdirectory `vp test` was invoked from.
 */
const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const context = readRepoFile("CONTEXT.md");

function captured(source: string, pattern: RegExp): readonly string[] {
  return [...source.matchAll(pattern)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

/** Exactly the surface #19 enumerated: every `export const X = Schema.…` in the SSoT module. */
const schemaNames = captured(
  readRepoFile("src/data/schemas.ts"),
  /^export const (\w+) = Schema\./gm,
);

/**
 * Read off disk rather than imported module by module, so a *new* file under `src/domain/` is
 * covered the moment it lands instead of when somebody remembers to extend a list here.
 */
const domainFunctionNames = readdirSync(join(repoRoot, "src/domain"))
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .flatMap((file) => captured(readRepoFile(`src/domain/${file}`), /^export function (\w+)/gm));

/** Word-bounded: a bare `Country` row must not be satisfied by `CountryAssessment` sitting nearby. */
function mentions(name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(context);
}

describe("CONTEXT.md のトレーサビリティ台帳", () => {
  it("schemas.ts のスキーマを1つも取りこぼさずに数えられている", () => {
    // 正規表現が静かに空振りしたら、以下の it.each が0件で全部通ってしまう。
    expect(schemaNames.length).toBeGreaterThanOrEqual(21);
  });

  it.each(schemaNames)("スキーマ %s が台帳に載っている", (name) => {
    expect(mentions(name)).toBe(true);
  });

  it("src/domain の公開関数を1つも取りこぼさずに数えられている", () => {
    expect(domainFunctionNames.length).toBeGreaterThanOrEqual(10);
  });

  it.each(domainFunctionNames)("ドメイン関数 %s が台帳に載っている", (name) => {
    expect(mentions(name)).toBe(true);
  });
});
