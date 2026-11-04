import { defineConfig } from "vitest/config"

export default defineConfig({
  // tsconfig keeps JSX for Next ("preserve"); the tests still need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    name: "web",
    environment: "jsdom",
    globals: false,
    include: ["test/**/*.test.{ts,tsx}"],
  },
})
