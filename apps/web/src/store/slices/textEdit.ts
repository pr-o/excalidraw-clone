import type { StateCreator } from "zustand"

export interface TextEditSlice {
  textEditElementId: string | null
  setTextEditElementId: (id: string | null) => void
}

export const createTextEditSlice: StateCreator<TextEditSlice, [], [], TextEditSlice> = (set) => ({
  textEditElementId: null,
  setTextEditElementId: (id) => set({ textEditElementId: id }),
})
