import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "ui",
    environment: "jsdom",
    globals: false,
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
})
