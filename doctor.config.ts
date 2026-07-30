import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {
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
