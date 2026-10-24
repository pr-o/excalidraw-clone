import type { StateCreator } from "zustand"

export type DialogId =
  | null
  | "help"
  | "export"
  | "reset"
  | "mermaid-import"
  | "mermaid-export"
  | "stickers"
  | "snapshots"
  | "array-duplicate"

export interface DialogSlice {
  openDialog: DialogId
  setOpenDialog: (d: DialogId) => void
}

export const createDialogSlice: StateCreator<DialogSlice, [], [], DialogSlice> = (set) => ({
  openDialog: null,
  setOpenDialog: (d) => set({ openDialog: d }),
})
