import type { StateCreator } from "zustand"

export interface RulersSlice {
  /** Rulers and the page's user guides show (and snap) together. */
  rulersVisible: boolean
  toggleRulers: () => void
}

export const createRulersSlice: StateCreator<RulersSlice, [], [], RulersSlice> = (set) => ({
  rulersVisible: false,
  toggleRulers: () => set((s) => ({ rulersVisible: !s.rulersVisible })),
})
