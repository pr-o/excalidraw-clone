import type { StateCreator } from "zustand"

export type DialogId = null | "help" | "export" | "reset" | "canvasBg"

export interface DialogSlice {
  openDialog: DialogId
  setOpenDialog: (d: DialogId) => void
}

export const createDialogSlice: StateCreator<DialogSlice, [], [], DialogSlice> = (set) => ({
  openDialog: null,
  setOpenDialog: (d) => set({ openDialog: d }),
})
