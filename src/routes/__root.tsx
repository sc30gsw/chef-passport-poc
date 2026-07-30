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

function NotFoundComponent() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">404</h1>
      <p>ページが見つかりませんでした。</p>
    </div>
  );
}

function ErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-red-600">エラー</h1>
      <p>{error.message}</p>
    </div>
  );
}

function PendingComponent() {
  return (
    <div className="p-4">
      <p>読み込み中...</p>
    </div>
  );
}
