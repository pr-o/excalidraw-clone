import type { ToolName } from "@excalidraw-clone/tools"
import type { StateCreator } from "zustand"

export interface ToolStateSlice {
  toolStates: Partial<Record<ToolName, unknown>>
  setToolState: (name: ToolName, state: unknown) => void
  resetToolState: (name: ToolName) => void
}

export const createToolStateSlice: StateCreator<ToolStateSlice, [], [], ToolStateSlice> = (
  set,
) => ({
  toolStates: {},
  setToolState: (name, state) => set((s) => ({ toolStates: { ...s.toolStates, [name]: state } })),
  resetToolState: (name) =>
    set((s) => {
      const copy = { ...s.toolStates }
      delete copy[name]
      return { toolStates: copy }
    }),
})
