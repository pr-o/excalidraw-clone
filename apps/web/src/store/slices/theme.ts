import type { StateCreator } from "zustand"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const computeResolvedTheme = (theme: Theme, prefersDark: boolean): ResolvedTheme =>
  theme === "system" ? (prefersDark ? "dark" : "light") : theme

export interface ThemeSlice {
  theme: Theme
  setTheme: (t: Theme) => void
  /** Derived from theme + OS preference by the App effect; never persisted. */
  resolvedTheme: ResolvedTheme
  setResolvedTheme: (t: ResolvedTheme) => void
}

export const createThemeSlice: StateCreator<ThemeSlice, [], [], ThemeSlice> = (set) => ({
  theme: "light",
  setTheme: (t) => set({ theme: t }),
  resolvedTheme: "light",
  setResolvedTheme: (t) => set({ resolvedTheme: t }),
})
