import type { StateCreator } from "zustand"

export type Theme = "light" | "dark" | "system"

export interface ThemeSlice {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const createThemeSlice: StateCreator<ThemeSlice, [], [], ThemeSlice> = (set) => ({
  theme: "light",
  setTheme: (t) => set({ theme: t }),
})
