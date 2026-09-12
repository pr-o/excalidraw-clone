import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("findSlice — findOpen", () => {
  beforeEach(() => useAppStore.getState().setFindOpen(false))

  it("defaults to false", () => {
    expect(useAppStore.getState().findOpen).toBe(false)
  })

  it("setFindOpen toggles the flag", () => {
    useAppStore.getState().setFindOpen(true)
    expect(useAppStore.getState().findOpen).toBe(true)
    useAppStore.getState().setFindOpen(false)
    expect(useAppStore.getState().findOpen).toBe(false)
  })
})
