---
description: TanStack Start conventions — server functions, streaming, Vercel deploy via Nitro, Node-side scripts
globs: ["src/routes/**/*.{ts,tsx}", "src/features/**/*-server.ts", "scripts/**/*.ts", "vite.config.ts"]
alwaysApply: true
---

# TanStack Start

`@tanstack/react-start` ^1.168 on Vite+. There is no Next.js here — ignore Next-specific guidance from any library's docs.

## Server functions are the only API layer

`createServerFn` is the typed RPC boundary. No Elysia, no Hono, no separate REST layer — TanStack Start already provides typed RPC plus raw server routes, and adding an HTTP framework would duplicate both.

```typescript
// CORRECT: validate with effect/Schema, keep the body extractable
export const generatePassportServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Schema.decodeUnknownSync(FreeInputRequest)(data))
  .handler(({ data }) => runPassportPipeline(data));

// WRONG: casting instead of validating
.handler(({ data }) => runPassportPipeline(data as FreeInputRequest));
```

Keep the handler body in a plain exported function (`runPassportPipeline`) so it can be unit-tested without the wrapper. See [../common/testing.md](../common/testing.md).

Return **plain serializable data only** — never `Effect`, `Exit`, `Option`, or an `Error` subclass. See [../typescript/effect-patterns.md](../typescript/effect-patterns.md).

## Env vars are read inside the handler

```typescript
// CORRECT
.handler(() => {
  const key = process.env.AI_GATEWAY_API_KEY;
  // ...
});

// WRONG: module scope is evaluated during bundling
const key = process.env.AI_GATEWAY_API_KEY;
```

Never use a `VITE_` prefix for server-only values. See [../common/security.md](../common/security.md).

## Streaming

Server functions support `ReadableStream` and async generators, and these work on Vercel (Nitro compiles them to Vercel Functions on Fluid compute). The 25-second first-byte limit applies to **Edge only**; the Node runtime allows up to 300s on Hobby.

Progress events are your own type — `@effect/ai` has no progress API. Stream model output with `LanguageModel.streamText` and interleave your events with `Stream.merge`.

## Routes stay thin

```typescript
// CORRECT: named export, composition only
export const Route = createFileRoute("/passport/$personaId")({
  component: PassportPage,
  loader: ({ params }) => loadCachedPassport(params.personaId),
});
```

`routeTree.gen.ts` is generated — already in `fmt.ignorePatterns` and `lint.ignorePatterns`. Never edit it.

## Vercel deployment

Four things are required; none are optional.

1. **Nitro plugin.** `tanstackStart()` has no hosting `target` option — hosting goes through Nitro.

```typescript
import { nitro } from "nitro/vite";
plugins: [tailwindcss(), tanstackStart(), nitro(), react(), babel({ ... })]
```

2. **Explicit framework.** Vercel's detector requires a direct `@tanstack/router-plugin` dependency, which this repo does not have, so auto-detection lands on the wrong preset.

```json
{ "framework": "tanstack-start" }
```

3. **pnpm version.** The lockfile is `lockfileVersion: 9.0`; Vercel runs pnpm 9/10, so the pnpm-11-only keys in `pnpm-workspace.yaml` (`trustPolicy`, `allowBuilds`) are ignored there. Force pnpm 11 with `ENABLE_EXPERIMENTAL_COREPACK=1` plus an explicit install command so local and remote resolution match.

4. **Node version.** Vercel does not read `.node-version` — `engines.node` applies. `>=24.17.0` resolves to Vercel's default 24.x.

`vp build` runs unchanged because Vercel prefers the `package.json` build script over the preset default. There is no public track record of vite-plus on Vercel — treat the first deploy as an experiment, not a formality.

## Node-side scripts

`scripts/**` runs under plain Node 24, which strips TypeScript natively with no flags.

```json
"generate:passport": "node --env-file-if-exists=.env scripts/generate-passport.ts"
```

Constraints that differ from `src/`:

- **Explicit `.ts` extensions are mandatory** — extensionless specifiers throw `ERR_MODULE_NOT_FOUND`
- **The `~/` alias does not work** — Node ignores tsconfig `paths`. Use relative imports
- **Vite-only syntax is unavailable** — no `?url`, `?raw`, or `import.meta.env`
- `tsconfig.json` needs `scripts` in `include` and `allowImportingTsExtensions: true`
