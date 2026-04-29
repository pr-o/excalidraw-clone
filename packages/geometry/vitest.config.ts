import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "geometry",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
