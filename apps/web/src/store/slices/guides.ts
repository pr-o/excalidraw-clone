import type { AlignmentGuide } from "@excalidraw-clone/geometry"
import type { StateCreator } from "zustand"

export interface GuidesSlice {
  activeGuides: readonly AlignmentGuide[]
  setActiveGuides: (guides: readonly AlignmentGuide[]) => void
}

export const createGuidesSlice: StateCreator<GuidesSlice, [], [], GuidesSlice> = (set) => ({
  activeGuides: [],
  setActiveGuides: (guides) => set({ activeGuides: guides }),
})
