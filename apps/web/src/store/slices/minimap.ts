import type { StateCreator } from "zustand"

export interface MinimapSlice {
  /** Opt-in navigation panel; persisted like the other view prefs. */
  minimapVisible: boolean
  toggleMinimap: () => void
}

export const createMinimapSlice: StateCreator<MinimapSlice, [], [], MinimapSlice> = (set) => ({
  minimapVisible: false,
  toggleMinimap: () => set((s) => ({ minimapVisible: !s.minimapVisible })),
})
