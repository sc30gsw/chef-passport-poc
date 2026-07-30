/// <reference types="vite-plus/client" />
import type { ErrorComponentProps } from "@tanstack/react-router";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import appCss from "../styles.css?url";

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const { TanStackRouterDevtools } = await import("../router-devtools");
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
      { title: "TanStack Start Template" },
    ],
  }),
  notFoundComponent: NotFoundComponent,
  pendingComponent: PendingComponent,
});

function RootComponent() {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
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
