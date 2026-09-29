import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("guidesSlice — activeGuides", () => {
  beforeEach(() => useAppStore.getState().setActiveGuides([]))

  it("defaults to an empty array", () => {
    expect(useAppStore.getState().activeGuides).toEqual([])
  })

  it("setActiveGuides replaces the guides", () => {
    const guides = [{ axis: "x" as const, position: 10, start: 0, end: 20 }]
    useAppStore.getState().setActiveGuides(guides)
    expect(useAppStore.getState().activeGuides).toEqual(guides)
    useAppStore.getState().setActiveGuides([])
    expect(useAppStore.getState().activeGuides).toEqual([])
  })
})
