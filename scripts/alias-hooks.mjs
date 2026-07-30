import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Node ignores tsconfig `paths`, so modules under `src/` that import each other via `~/` cannot be
 * loaded by a plain-Node script. `.claude/rules/typescript/project-structure.md` says scripts should
 * use relative imports — which covers the script's own imports, but not its dependencies': every
 * file under `src/` uses `~/` internally.
 *
 * This resolve hook closes that gap. It also appends `.ts`, because Node's native type stripping
 * still requires an explicit extension.
 */
const srcRoot = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("~/")) {
    return nextResolve(specifier, context);
  }

  const base = new URL(specifier.slice(2), srcRoot);
  const candidates = [base.href, `${base.href}.ts`, `${base.href}.tsx`];
  const found = candidates.find((candidate) => existsSync(fileURLToPath(candidate)));

  return nextResolve(found ?? base.href, context);
}
