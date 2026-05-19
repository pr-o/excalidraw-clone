import type { ImageReadyEvent, ToolEvent } from "@excalidraw-clone/tools"
import type { StateCreator } from "zustand"

export type ToolEventDispatcher = (event: ToolEvent | ImageReadyEvent) => void

export interface DispatchSlice {
  dispatchToolEvent: ToolEventDispatcher | null
  setDispatchToolEvent: (fn: ToolEventDispatcher | null) => void
}

export const createDispatchSlice: StateCreator<DispatchSlice, [], [], DispatchSlice> = (set) => ({
  dispatchToolEvent: null,
  setDispatchToolEvent: (fn) => set({ dispatchToolEvent: fn }),
})
