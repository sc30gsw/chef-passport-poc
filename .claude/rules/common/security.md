---
description: Secret handling, server-only env vars, input validation via effect/Schema, public-demo abuse guard
globs: ["**/*.{ts,tsx}"]
alwaysApply: true
---

# Security

This app deploys to a **public URL** with a **paid** AI Gateway key behind it, and the repository is **public**. Both facts drive the rules below.

## Secrets

NEVER hardcode secrets, tokens, or credentials in source files.

`.gitignore` must cover `.env*` with an explicit allowance for the example file. The default ignore list only names `.env`, `.env.local`, and `.env.*.local` — which means `.env.development` and `.env.production` would be **committed**.

```gitignore
.env*
!.env.example
```

## Server-only env vars

`AI_GATEWAY_API_KEY` is server-only. It must **never** carry a `VITE_` prefix — `VITE_*` is inlined into the client bundle at build time.

```typescript
// CORRECT: read inside the handler
export const generatePassportServer = createServerFn().handler(async ({ data }) => {
  const client = AnthropicClient.layerConfig({
    apiKey: Config.redacted("AI_GATEWAY_API_KEY"),
    apiUrl: Config.succeed(process.env.AI_GATEWAY_BASE_URL ?? "https://api.anthropic.com"),
  });
  // ...
});

// WRONG: module scope — evaluated during bundling
const apiKey = process.env.AI_GATEWAY_API_KEY;

// WRONG: VITE_ prefix ships the key to the browser
const apiKey = import.meta.env.VITE_AI_GATEWAY_API_KEY;
```

Locally the `generate:passport` script reads `.env` via `--env-file-if-exists`. On Vercel the value comes from project environment variables, added **without** a prefix.

## Input validation

Validate every external input at the boundary with `effect/Schema`. See [../typescript/effect-schema.md](../typescript/effect-schema.md).

```typescript
// CORRECT
const input = yield* Schema.decodeUnknown(FreeInputRequest)(rawData);

// WRONG
const resume = (rawData as { resume: string }).resume;
```

## Public-demo abuse guard

Free-input mode calls a paid API from a public URL. All three guards are required:

1. **Feature flag** — free-input mode gated behind a server-side env flag, off by default. Preset personas run from the committed cache and work with the flag off.
2. **Input length cap** — enforced in the schema, not only in the UI.
3. **Spend ceiling** — a per-API-key budget set in the AI Gateway dashboard.

```typescript
const MAX_RESUME_LENGTH = 2000;

const FreeInputRequest = Schema.Struct({
  resume: Schema.String.pipe(Schema.minLength(50), Schema.maxLength(MAX_RESUME_LENGTH)),
});
```

## Demo-data disclaimer

Visa requirements and job listings here are **mock data for demonstration**, not legal advice. The disclaimer lives in `src/routes/__root.tsx` so omission is structurally impossible, and every visa card links its source URL.

## XSS

Avoid `dangerouslySetInnerHTML`. LLM output is untrusted input — render it as text, never as HTML.
