import type { StateCreator } from "zustand"

export interface PointerSlice {
  lastScenePointer: { x: number; y: number } | null
  setLastScenePointer: (p: { x: number; y: number }) => void
  /** True while the OS pointer is physically over the canvas element. Distinct
   *  from `lastScenePointer` (a sticky last-known scene coordinate used for
   *  paste-at-cursor): this clears the moment the pointer leaves the canvas, so
   *  the hover link indicator does not linger. */
  pointerOverCanvas: boolean
  setPointerOverCanvas: (v: boolean) => void
}

export const createPointerSlice: StateCreator<PointerSlice, [], [], PointerSlice> = (set) => ({
  lastScenePointer: null,
  setLastScenePointer: (p) => set({ lastScenePointer: p }),
  pointerOverCanvas: false,
  setPointerOverCanvas: (v) => set({ pointerOverCanvas: v }),
})
