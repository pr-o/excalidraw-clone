import { defineConfig } from "vitest/config"

// Runs every package's tests from the root (`pnpm exec vitest`); `pnpm test` runs them per package via Turbo.
export default defineConfig({
  test: { projects: ["packages/*", "apps/*"] },
})
