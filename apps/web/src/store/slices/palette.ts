import type { StateCreator } from "zustand"

export interface PaletteSlice {
  paletteOpen: boolean
  setPaletteOpen: (b: boolean) => void
}

export const createPaletteSlice: StateCreator<PaletteSlice, [], [], PaletteSlice> = (set) => ({
  paletteOpen: false,
  setPaletteOpen: (b) => set({ paletteOpen: b }),
})
