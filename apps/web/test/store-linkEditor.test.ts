import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("linkEditorSlice", () => {
  beforeEach(() => useAppStore.getState().setLinkEditorElementId(null))

  it("starts null", () => {
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })

  it("setLinkEditorElementId sets and clears", () => {
    useAppStore.getState().setLinkEditorElementId("el-1")
    expect(useAppStore.getState().linkEditorElementId).toBe("el-1")
    useAppStore.getState().setLinkEditorElementId(null)
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })
})
