import type { StateCreator } from "zustand"

export type Locale = "en" | "ko"

export interface I18nSlice {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const createI18nSlice: StateCreator<I18nSlice, [], [], I18nSlice> = (set) => ({
  locale: "en",
  setLocale: (l) => set({ locale: l }),
})
