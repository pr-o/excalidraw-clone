import type { StateCreator } from "zustand"

export interface PresentationSlice {
  presenting: boolean
  slideIndex: number
  enterPresentation: () => void
  exitPresentation: () => void
  goToSlide: (i: number) => void
  nextSlide: () => void
  prevSlide: () => void
}

export const createPresentationSlice: StateCreator<PresentationSlice, [], [], PresentationSlice> = (
  set,
) => ({
  presenting: false,
  slideIndex: 0,
  enterPresentation: () => set({ presenting: true, slideIndex: 0 }),
  exitPresentation: () => set({ presenting: false, slideIndex: 0 }),
  goToSlide: (i) => set({ slideIndex: i }),
  nextSlide: () => set((s) => ({ slideIndex: s.slideIndex + 1 })),
  prevSlide: () => set((s) => ({ slideIndex: Math.max(0, s.slideIndex - 1) })),
})
