import type { ErrorComponentProps } from "@tanstack/react-router";

/** Unstyled on purpose — see the note above `notFoundComponent` in `src/routes/__root.tsx`. */
export function RootError({ error }: ErrorComponentProps) {
  return (
    <div>
      <h1>エラー</h1>
      <p>{error.message}</p>
    </div>
  );
}
