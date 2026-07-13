import { describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"
import { computeResolvedTheme } from "../src/store/slices/theme"

describe("computeResolvedTheme", () => {
  it("passes explicit themes through regardless of OS preference", () => {
    expect(computeResolvedTheme("light", true)).toBe("light")
    expect(computeResolvedTheme("dark", false)).toBe("dark")
  })

  it("resolves system from the OS preference", () => {
    expect(computeResolvedTheme("system", true)).toBe("dark")
    expect(computeResolvedTheme("system", false)).toBe("light")
  })
})

describe("resolvedTheme slice", () => {
  it("defaults to light and updates via setResolvedTheme", () => {
    expect(useAppStore.getState().resolvedTheme).toBe("light")
    useAppStore.getState().setResolvedTheme("dark")
    expect(useAppStore.getState().resolvedTheme).toBe("dark")
    useAppStore.getState().setResolvedTheme("light")
  })
})
