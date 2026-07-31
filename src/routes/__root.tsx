/// <reference types="vite-plus/client" />
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { DemoDisclaimerBanner } from "~/components/demo-disclaimer-banner";
import { theme } from "~/config/theme";

import appCss from "~/styles.css?url";

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const { TanStackRouterDevtools } = await import("~/router-devtools");
      return { default: TanStackRouterDevtools };
    })
  : null;

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: ErrorComponent,
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "Chef Passport — 日本人シェフの海外就労適合デモ" },
      {
        content:
          "日本人シェフの経歴から、どの国のどの厨房でどのビザなら通用するかを提示するPoC。判定は決定論、言語化のみLLM。",
        name: "description",
      },
    ],
  }),
  notFoundComponent: NotFoundComponent,
  pendingComponent: PendingComponent,
});

function RootComponent() {
  return (
    // `mantineHtmlProps` + `ColorSchemeScript` in <head> is what prevents the flash of
    // unstyled content. There is no official Mantine guide for TanStack Start; this wiring
    // is documented in .claude/rules/web/mantine-tailwind.md.
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider defaultColorScheme="light" theme={theme}>
          <DemoDisclaimerBanner />
          <Outlet />
        </MantineProvider>
        {TanStackRouterDevtools ? (
          <Suspense fallback={null}>
            <TanStackRouterDevtools position="bottom-right" />
          </Suspense>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The three fallbacks below are deliberately plain HTML with no styling at all.
 *
 * On the **root** route these replace `RootComponent` itself — `@tanstack/react-router`'s
 * `MatchView` puts the catch/not-found boundaries around the match's own component, and this repo
 * sets no `shellComponent`. So when one of them renders there is no `<html>`, no `<HeadContent />`
 * and therefore no `styles.css` link, and no `MantineProvider`. Mantine components would throw
 * ("MantineProvider was not found in component tree") and Tailwind classes would resolve to
 * nothing, which is why audit #17 finding 6's proposed `Title`/`Text` + `c="red.6"` is *not* the
 * fix here. The finding's actual complaint — typography re-implemented in Tailwind and a
 * `text-red-600` outside the Mantine token space — is answered by removing the styling instead:
 * an unstyled `<h1>エラー</h1>` says exactly as much as a red one, and cannot lie about being
 * themed. Restoring the shell for these screens needs `shellComponent` and is a separate change.
 */
function NotFoundComponent() {
  return (
    <div>
      <h1>404</h1>
      <p>ページが見つかりませんでした。</p>
    </div>
  );
}

function ErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div>
      <h1>エラー</h1>
      <p>{error.message}</p>
    </div>
  );
}

function PendingComponent() {
  return (
    <div>
      <p>読み込み中...</p>
    </div>
  );
}
