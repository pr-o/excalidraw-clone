import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("pointerSlice — pointerOverCanvas", () => {
  beforeEach(() => useAppStore.getState().setPointerOverCanvas(false))

  it("defaults to false", () => {
    expect(useAppStore.getState().pointerOverCanvas).toBe(false)
  })

  it("setPointerOverCanvas toggles the flag", () => {
    useAppStore.getState().setPointerOverCanvas(true)
    expect(useAppStore.getState().pointerOverCanvas).toBe(true)
    useAppStore.getState().setPointerOverCanvas(false)
    expect(useAppStore.getState().pointerOverCanvas).toBe(false)
  })

  it("leaves lastScenePointer untouched", () => {
    useAppStore.getState().setLastScenePointer({ x: 1, y: 2 })
    useAppStore.getState().setPointerOverCanvas(true)
    expect(useAppStore.getState().lastScenePointer).toEqual({ x: 1, y: 2 })
  })
})
