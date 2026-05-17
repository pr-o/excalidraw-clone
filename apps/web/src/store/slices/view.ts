import type { ViewTransform } from "@excalidraw-clone/geometry"
import type { StateCreator } from "zustand"

export interface ViewSlice {
  scrollX: number
  scrollY: number
  zoom: number
  zenMode: boolean
  setView: (v: ViewTransform) => void
  toggleZenMode: () => void
}

export const createViewSlice: StateCreator<ViewSlice, [], [], ViewSlice> = (set) => ({
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
  zenMode: false,
  setView: (v) => set({ scrollX: v.scrollX, scrollY: v.scrollY, zoom: v.zoom }),
  toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),
})
