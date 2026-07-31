/**
 * Global mock for `createServerFn` so server-function handlers can be imported and called
 * directly in unit tests. Combines two patterns from TanStack Router Discussion #2701:
 *
 * - global-mock direction: https://github.com/TanStack/router/discussions/2701#discussion-7425606
 * - builder structure: https://github.com/TanStack/router/discussions/2701#discussioncomment-15184454
 *
 * Divergence from the second source: `inputValidator` **runs** the validator instead of
 * skipping it, so schema-failure tests still exercise the decode boundary.
 *
 * Requires `tanstackStart()` to be dropped from the Vite plugin list under Vitest — otherwise
 * the plugin has already rewritten `handler(fn)` into a client RPC stub and this never runs.
 */
import { vi } from "vite-plus/test";

type ServerFnHandler = (opts: { data: unknown }) => unknown;
type ServerFnValidator = (data: unknown) => unknown;

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tanstack/react-start")>();

  const builder = {
    handler: (fn: ServerFnHandler) => (opts?: { data?: unknown }) => fn({ data: opts?.data }),
    inputValidator: (validate: ServerFnValidator) => ({
      handler: (fn: ServerFnHandler) => (opts?: { data?: unknown }) =>
        fn({ data: validate(opts?.data) }),
    }),
    middleware: () => builder,
  };

  return { ...original, createServerFn: () => builder };
});
