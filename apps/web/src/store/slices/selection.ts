import type { StateCreator } from "zustand"

export interface SelectionSlice {
  selectedIds: readonly string[]
  setSelection: (ids: readonly string[]) => void
  addToSelection: (ids: readonly string[]) => void
  removeFromSelection: (ids: readonly string[]) => void
}

export const createSelectionSlice: StateCreator<SelectionSlice, [], [], SelectionSlice> = (
  set,
) => ({
  selectedIds: [],
  setSelection: (ids) => set({ selectedIds: [...ids] }),
  addToSelection: (ids) =>
    set((s) => {
      const set_ = new Set(s.selectedIds)
      for (const id of ids) set_.add(id)
      return { selectedIds: [...set_] }
    }),
  removeFromSelection: (ids) =>
    set((s) => {
      const set_ = new Set(s.selectedIds)
      for (const id of ids) set_.delete(id)
      return { selectedIds: [...set_] }
    }),
})
