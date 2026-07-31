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
        // tsconfig.json's "libReplacement": true is what activates better-typescript-lib —
        // a TS compiler flag, not an import, so deslop (react-doctor's dead-code engine) has
        // nothing to trace. deslop has no per-dependency ignore list (unlike fallow's
        // ignoreDependencies), so a file-scoped override — narrowed to package.json, the only
        // file this rule can ever fire against — is the narrowest suppression its schema
        // supports. See #14.
        files: ["package.json"],
        rules: ["deslop/unused-dev-dependency"],
      },
    ],
  },
});
