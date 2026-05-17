import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "web",
    environment: "jsdom",
    globals: false,
    include: ["test/**/*.test.{ts,tsx}"],
  },
})
