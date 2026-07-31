import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {
    /**
     * Not source. Nothing here is written, reviewed or shipped by this repo, and a finding in one
     * of them is a finding about somebody else's code:
     *
     * - `.output/**` is Nitro's build output, left on disk by `vp build` and gitignored. Scanning
     *   it reports bundled third-party sources — three `dangerous-html-sink` hits inside
     *   `@tanstack/react-router` and one `insecure-crypto-risk` inside `@effect/ai`.
     * - `.claude/**` and its siblings are vendored by external tool installers. `vite.config.ts`
     *   excludes the same set from `fmt` and `lint` for the same reason; without this a
     *   `js-flatmap-filter` hint in a Claude Code hook script would fail the CI gate.
     *
     * Excluding them is what makes `blocking: warning` in .github/workflows/react-doctor.yml
     * honest: the gate then fails only on this project's own code. See #20.
     */
    files: [
      ".output/**",
      "dist/**",
      ".vercel/**",
      ".agents/**",
      ".claude/**",
      ".cursor/**",
      ".serena/**",
    ],
    overrides: [
      {
        // Two dependencies are real but have no first-party import for deslop (react-doctor's
        // dead-code engine) to trace:
        // - better-typescript-lib: activated by tsconfig.json's "libReplacement": true — a TS
        //   compiler flag, not an import. See #14.
        // - @mantine/hooks: @mantine/core's documented peer pair, imported internally by
        //   @mantine/core at runtime; Mantine requires both to be installed together.
        // deslop has no per-dependency ignore list (unlike fallow's ignoreDependencies), so a
        // file-scoped override — narrowed to package.json, the only file these rules can ever
        // fire against — is the narrowest suppression its schema supports. fallow remains the
        // per-name gate for genuinely unused dependencies (it runs in ci.yml).
        files: ["package.json"],
        rules: ["deslop/unused-dev-dependency", "deslop/unused-dependency"],
      },
    ],
  },
});
