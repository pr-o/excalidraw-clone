import i18next from "i18next"
import { initReactI18next } from "react-i18next"
import enCommon from "./locales/en/common.json"
import enShortcuts from "./locales/en/shortcuts.json"
import koCommon from "./locales/ko/common.json"
import koShortcuts from "./locales/ko/shortcuts.json"

let initialized = false

export function ensureI18n(initialLocale: "en" | "ko"): typeof i18next {
  // Later locale changes are applied by useEditorEnvironment's effect, never during render.
  if (initialized) return i18next
  void i18next.use(initReactI18next).init({
    lng: initialLocale,
    fallbackLng: "en",
    ns: ["common", "shortcuts"],
    defaultNS: "common",
    resources: {
      en: { common: enCommon, shortcuts: enShortcuts },
      ko: { common: koCommon, shortcuts: koShortcuts },
    },
    interpolation: { escapeValue: false },
  })
  initialized = true
  return i18next
}
