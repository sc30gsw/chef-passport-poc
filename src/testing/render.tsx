import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

import { theme } from "~/config/theme";

/**
 * Mantine components read theme and color-scheme from context, so Testing Library's bare
 * `render` throws for anything below `MantineProvider`. Always use this instead.
 */
export function renderWithMantine(ui: ReactNode) {
  return render(
    <MantineProvider defaultColorScheme="light" theme={theme}>
      {ui}
    </MantineProvider>,
  );
}
