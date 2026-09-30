import { describe, expect, it } from "vitest"
import { ensureI18n } from "../src/i18n"

// `ensureI18n` initializes a module-level singleton, so tests read through
// `getFixedT(locale)` instead of switching the active language (which is async).

describe("Font size i18n — en", () => {
  it("resolves the font-size label and preset names, not raw keys", () => {
    const t = ensureI18n("en").getFixedT("en", "common")
    expect(t("properties.fontSize")).toBe("Font size")
    expect(t("properties.fontSize_s")).toBe("S")
    expect(t("properties.fontSize_m")).toBe("M")
    expect(t("properties.fontSize_l")).toBe("L")
    expect(t("properties.fontSize_xl")).toBe("XL")
  })
})

describe("Font size i18n — ko", () => {
  it("resolves the font-size label and preset names, not raw keys", () => {
    const t = ensureI18n("ko").getFixedT("ko", "common")
    expect(t("properties.fontSize")).toBe("글자 크기")
    expect(t("properties.fontSize_s")).toBe("소")
    expect(t("properties.fontSize_m")).toBe("중")
    expect(t("properties.fontSize_l")).toBe("대")
    expect(t("properties.fontSize_xl")).toBe("특대")
  })
})
