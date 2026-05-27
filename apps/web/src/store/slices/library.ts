import type { LibraryItem } from "@excalidraw-clone/scene"
import type { StateCreator } from "zustand"

export interface LibrarySlice {
  libraryItems: LibraryItem[]
  pendingItem: LibraryItem | null
  setLibraryItems: (items: LibraryItem[]) => void
  armLibraryItem: (item: LibraryItem) => void
  clearPendingItem: () => void
}

export const createLibrarySlice: StateCreator<LibrarySlice, [], [], LibrarySlice> = (set) => ({
  libraryItems: [],
  pendingItem: null,
  setLibraryItems: (items) => set({ libraryItems: items }),
  armLibraryItem: (item) => set({ pendingItem: item }),
  clearPendingItem: () => set({ pendingItem: null }),
})
