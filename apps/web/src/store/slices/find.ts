import type { StateCreator } from "zustand"

export interface FindSlice {
  findOpen: boolean
  setFindOpen: (b: boolean) => void
}

export const createFindSlice: StateCreator<FindSlice, [], [], FindSlice> = (set) => ({
  findOpen: false,
  setFindOpen: (b) => set({ findOpen: b }),
})
