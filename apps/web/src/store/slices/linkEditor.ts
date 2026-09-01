import type { StateCreator } from "zustand"

export interface LinkEditorSlice {
  linkEditorElementId: string | null
  setLinkEditorElementId: (id: string | null) => void
}

export const createLinkEditorSlice: StateCreator<LinkEditorSlice, [], [], LinkEditorSlice> = (
  set,
) => ({
  linkEditorElementId: null,
  setLinkEditorElementId: (id) => set({ linkEditorElementId: id }),
})
