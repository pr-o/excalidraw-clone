import type { StateCreator } from "zustand"
import {
  loadToolKeyOverrides,
  saveToolKeyOverrides,
  type ToolKeyOverrides,
} from "../../keyboard/toolKeys"

export interface ToolKeysSlice {
  /** User rebindings of the single-key tool shortcuts; persisted on every change. */
  toolKeyOverrides: ToolKeyOverrides
  setToolKeyOverrides: (o: ToolKeyOverrides) => void
}

export const createToolKeysSlice: StateCreator<ToolKeysSlice, [], [], ToolKeysSlice> = (set) => ({
  toolKeyOverrides: loadToolKeyOverrides(),
  setToolKeyOverrides: (o) => {
    saveToolKeyOverrides(o)
    set({ toolKeyOverrides: o })
  },
})
