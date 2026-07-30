import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";
import "@testing-library/jest-dom/vitest";

import "~/testing/server-fn-mock";

// Vite+ runs with `globals: false`, so Testing Library's auto-cleanup (which hooks a global
// `afterEach`) never registers itself. Without this, DOM from one test leaks into the next.
afterEach(() => {
  cleanup();
});
