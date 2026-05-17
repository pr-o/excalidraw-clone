import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("selectionSlice", () => {
  beforeEach(() => {
    useAppStore.getState().setSelection([])
  })

  it("starts empty", () => {
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("setSelection replaces", () => {
    useAppStore.getState().setSelection(["a", "b"])
    expect(useAppStore.getState().selectedIds).toEqual(["a", "b"])
    useAppStore.getState().setSelection(["c"])
    expect(useAppStore.getState().selectedIds).toEqual(["c"])
  })

  it("addToSelection unions and dedupes", () => {
    useAppStore.getState().setSelection(["a"])
    useAppStore.getState().addToSelection(["a", "b"])
    expect([...useAppStore.getState().selectedIds].sort()).toEqual(["a", "b"])
  })

  it("removeFromSelection removes specified ids only", () => {
    useAppStore.getState().setSelection(["a", "b", "c"])
    useAppStore.getState().removeFromSelection(["b"])
    expect([...useAppStore.getState().selectedIds].sort()).toEqual(["a", "c"])
  })
})
