import { describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("toolSlice", () => {
  it("starts with selection tool, lock off", () => {
    const s = useAppStore.getState()
    expect(s.activeTool).toBe("selection")
    expect(s.lockActiveTool).toBe(false)
  })

  it("setActiveTool updates state", () => {
    useAppStore.getState().setActiveTool("rectangle")
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })

  it("toggleLockActiveTool flips boolean", () => {
    useAppStore.getState().setActiveTool("selection")
    const before = useAppStore.getState().lockActiveTool
    useAppStore.getState().toggleLockActiveTool()
    expect(useAppStore.getState().lockActiveTool).toBe(!before)
  })
})
