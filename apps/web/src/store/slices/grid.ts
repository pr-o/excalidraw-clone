import type { StateCreator } from "zustand"

export interface GridSlice {
  gridEnabled: boolean
  gridSize: number
  toggleGrid: () => void
  setGridSize: (n: number) => void
}

export const createGridSlice: StateCreator<GridSlice, [], [], GridSlice> = (set) => ({
  gridEnabled: false,
  gridSize: 20,
  toggleGrid: () => set((s) => ({ gridEnabled: !s.gridEnabled })),
  setGridSize: (n) => set({ gridSize: n }),
})
