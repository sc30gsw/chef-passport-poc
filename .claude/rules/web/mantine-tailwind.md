---
description: Mantine 9 + Tailwind 4 via tailwind-preset-mantine — layout in Tailwind, appearance in Mantine props, CSS layer rules, hook hazards
globs: ["src/**/*.tsx", "src/styles.css", "src/config/theme.ts"]
alwaysApply: true
---

# Mantine + Tailwind Coexistence

`@mantine/core@9.5.0` + `tailwind-preset-mantine@4.1.0`. Mantine 9 requires **React 19.2+** — no other Mantine major works with this repo.

## Single CSS entry point

`tailwind-preset-mantine` is CSS-first (Tailwind 4 removed the JS `presets` array). It replaces the Tailwind import entirely.

```css
/* src/styles.css — CORRECT */
@import "tailwind-preset-mantine";

/* WRONG: the preset already imports Tailwind's layers and Mantine's stylesheet */
@import "tailwindcss";
@import "@mantine/core/styles.css";
```

The preset declares `@layer theme, base, mantine, components, utilities` and imports `@mantine/core/styles.layer.css`, so Preflight cannot clobber Mantine and Tailwind utilities always win.

**Never import `@mantine/core/styles.css`.** Importing both it and `styles.layer.css` breaks specificity — an explicit Mantine warning. Additional Mantine packages must also use their `.layer.css` build, imported _after_ the preset.

`postcss-preset-mantine` is **not** required (Mantine documents it as optional authoring sugar). Leaving it out avoids any PostCSS interaction with `@tailwindcss/vite` and rolldown.

## Division of labour

Layout and spacing in Tailwind; component appearance in Mantine props.

```tsx
// CORRECT
<div className="grid grid-cols-3 gap-4">
  <Card padding="lg" radius="md" withBorder>
    <Badge color="green" variant="light">◎</Badge>
  </Card>
</div>

// WRONG: Tailwind re-implementing props Mantine already has
<Card className="rounded-md border p-6">
  <span className="rounded bg-green-100 px-2 text-green-800">◎</span>
</Card>

// WRONG: fighting Mantine internals with arbitrary selectors
<Button className="[&_.mantine-Button-label]:text-red-500">...</Button>
```

Write Tailwind classes as plain `className` string literals on wrapper elements. There is no class-composition helper: closed decision **#12** removed `~/utils/cn` and the `cnfast` dependency after the audit found zero conditional-className sites — Mantine props carry the conditional appearance, so nothing was left for `cn()` to compose. `fmt.sortTailwindcss` is enabled with defaults, so it sorts `class`/`className` and does not touch Mantine props. If a genuine conditional-className site ever appears, bring the helper back with that site in the same commit rather than in advance.

## Theme tokens

The preset maps Mantine's palette into Tailwind via `@theme inline`, so `bg-primary-6` resolves to `var(--mantine-primary-color-6)`. Never hardcode colour values.

```tsx
// CORRECT — either idiom, same token
<div className="bg-primary-6 text-white">
<Box bg="blue.6" c="white">

// WRONG
<div style={{ backgroundColor: "#228BE6" }}>
```

The theme uses a **named export** — Mantine's docs never use `export default`, so no `no-default-export` override is needed.

```typescript
// src/config/theme.ts
import { createTheme, DEFAULT_THEME, mergeMantineTheme } from "@mantine/core";

const override = createTheme({ primaryColor: "orange" });
export const theme = mergeMantineTheme(DEFAULT_THEME, override);
```

## SSR wiring

There is no official Mantine guide for TanStack Start. `__root.tsx` must own `<html>`, spread `mantineHtmlProps`, place `ColorSchemeScript` in `<head>` (this is what prevents the flash of unstyled content), and wrap children in `MantineProvider`.

```tsx
<html lang="ja" {...mantineHtmlProps}>
  <head>
    <ColorSchemeScript />
    <HeadContent />
  </head>
  <body>
    <MantineProvider theme={theme}>{/* disclaimer banner + <Outlet /> */}</MantineProvider>
    <Scripts />
  </body>
</html>
```

## `@mantine/hooks` hazards

Issue **#9078 is open** (fix PR #9079 unmerged as of 9.5.0): `useEffectEvent`-based hooks silently pin to the first render inside `forwardRef`/`memo`. It is a React-level bug, **not** React-Compiler-specific — it reproduces with the compiler absent.

Affected: `use-hotkeys`, `use-window-event`, `use-click-outside`, `use-page-leave`, `use-headroom`, `use-scroll-direction`, `use-scroll-spy`, `use-text-selection`, `use-collapse`.

Verified safe: `useDisclosure`, `useMediaQuery`, `useLocalStorage` (none use `useEffectEvent`).

Practical consequence: `Modal` and `Popover` use click-outside internally; `Accordion`/`Collapse` use collapse. **Always give modals an explicit close button** and never depend on click-outside-to-close — a modal that will not close during a live demo is the worst available failure mode.

`@mantine/form`'s equivalent bug (#9005, plus `useSet`/`useMap`) was fixed in 9.4.1.

## Related

- `frontend-design` skill — design direction
