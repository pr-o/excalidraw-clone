import type { ToolName } from "@excalidraw-clone/tools"
import type { StateCreator } from "zustand"

export interface ToolSlice {
  activeTool: ToolName
  lockActiveTool: boolean
  setActiveTool: (t: ToolName) => void
  toggleLockActiveTool: () => void
}

export const createToolSlice: StateCreator<ToolSlice, [], [], ToolSlice> = (set) => ({
  activeTool: "selection",
  lockActiveTool: false,
  setActiveTool: (t) => set({ activeTool: t }),
  toggleLockActiveTool: () => set((s) => ({ lockActiveTool: !s.lockActiveTool })),
})
