import { DEFAULT_THEME, createTheme, mergeMantineTheme } from "@mantine/core";

const override = createTheme({
  defaultRadius: "md",
  headings: { fontWeight: "700" },
  primaryColor: "orange",
});

export const theme = mergeMantineTheme(DEFAULT_THEME, override);
