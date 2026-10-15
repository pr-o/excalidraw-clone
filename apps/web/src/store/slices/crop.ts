import type { StateCreator } from "zustand"

export interface CropSlice {
  /** Image currently in crop mode; transient, never persisted. */
  cropElementId: string | null
  setCropElementId: (id: string | null) => void
}

export const createCropSlice: StateCreator<CropSlice, [], [], CropSlice> = (set) => ({
  cropElementId: null,
  setCropElementId: (id) => set({ cropElementId: id }),
})
