import type { StateCreator } from "zustand"

export interface CanvasBgSlice {
  canvasBg: string
  setCanvasBg: (color: string) => void
}

export const createCanvasBgSlice: StateCreator<CanvasBgSlice, [], [], CanvasBgSlice> = (set) => ({
  canvasBg: "#ffffff",
  setCanvasBg: (color) => set({ canvasBg: color }),
})
