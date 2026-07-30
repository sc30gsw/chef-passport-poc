# TanStack Start Starter

A minimal application template built with [TanStack Start](https://tanstack.com/start) and [TanStack Router](https://tanstack.com/router), using [Vite+](https://viteplus.dev/) as the unified CLI for development, builds, formatting, linting, and tests.

## What you get

- **TanStack Start** with file-based routing under `src/routes/`
- **React 19** and **TypeScript**
- **Tailwind CSS 4** with the Vite plugin
- [**`cnfast`**](https://github.com/aidenybai/cnfast) for class name merging (drop-in replacement for `clsx` + `tailwind-merge`)
- **Vite+**-managed tooling: Oxlint, Oxfmt, Vitest-style testing via `vite-plus/test` (see [AGENTS.md](AGENTS.md) for workflow and pitfalls)

## Requirements

- **Node.js** — see [`.node-version`](.node-version) (matches the `engines` field in `package.json`)
- **[Vite+](https://viteplus.dev/guide/)** — so the `vp` command is available on your `PATH`

Use `vp` for all dependency and tooling operations; see [AGENTS.md](AGENTS.md) for the full workflow and pitfalls.

## Getting started

```bash
git clone https://github.com/lightsound/tanstack-start-start.git
cd tanstack-start-start
vp install
vp dev
```

Open the URL printed in the terminal (Vite’s default is usually `http://localhost:5173`).

## Everyday commands

| Command      | Purpose                                                          |
| ------------ | ---------------------------------------------------------------- |
| `vp dev`     | Start the dev server with HMR                                    |
| `vp build`   | Production build                                                 |
| `vp preview` | Preview the production build locally                             |
| `vp check`   | Format, lint, and type-check (fix with `--fix` where applicable) |
| `vp test`    | Run tests                                                        |
| `vp help`    | List built-in commands and options                               |

`package.json` scripts (`dev`, `build`, `check`, `test`, …) delegate to these same `vp` entry points.

Optional maintenance tools (not part of `vp check`):

- `vp run fallow` — unused files, dependencies, exports (`.fallowrc.json`)
- `vp run doctor` — React health checks (`react-doctor`, `--no-lint` in the script)

## License

[MIT](LICENSE.md).
