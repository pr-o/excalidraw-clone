import type { StateCreator } from "zustand"

export interface GridSlice {
  gridEnabled: boolean
  gridSize: number
  toggleGrid: () => void
}

export const createGridSlice: StateCreator<GridSlice, [], [], GridSlice> = (set) => ({
  gridEnabled: false,
  gridSize: 20,
  toggleGrid: () => set((s) => ({ gridEnabled: !s.gridEnabled })),
})
