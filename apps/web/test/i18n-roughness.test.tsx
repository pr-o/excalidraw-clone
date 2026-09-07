import { describe, expect, it } from "vitest"
import { ensureI18n } from "../src/i18n"

// `ensureI18n` initializes a module-level singleton, so tests read through
// `getFixedT(locale)` instead of switching the active language (which is async).

describe("Sloppiness (roughness) i18n — en", () => {
  it("resolves the roughness label and preset names, not raw keys", () => {
    const t = ensureI18n("en").getFixedT("en", "common")
    expect(t("properties.roughness")).toBe("Sloppiness")
    expect(t("properties.roughness_0")).toBe("Architect")
    expect(t("properties.roughness_1")).toBe("Artist")
    expect(t("properties.roughness_2")).toBe("Cartoonist")
  })
})

describe("Sloppiness (roughness) i18n — ko", () => {
  it("resolves the roughness label and preset names, not raw keys", () => {
    const t = ensureI18n("ko").getFixedT("ko", "common")
    expect(t("properties.roughness")).toBe("거칠기")
    expect(t("properties.roughness_0")).toBe("건축가")
    expect(t("properties.roughness_1")).toBe("예술가")
    expect(t("properties.roughness_2")).toBe("만화가")
  })
})
