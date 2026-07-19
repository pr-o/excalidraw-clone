import type { StateCreator } from "zustand"

export interface PointerSlice {
  lastScenePointer: { x: number; y: number } | null
  setLastScenePointer: (p: { x: number; y: number }) => void
}

export const createPointerSlice: StateCreator<PointerSlice, [], [], PointerSlice> = (set) => ({
  lastScenePointer: null,
  setLastScenePointer: (p) => set({ lastScenePointer: p }),
})
