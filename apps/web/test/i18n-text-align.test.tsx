import { describe, expect, it } from "vitest"
import { ensureI18n } from "../src/i18n"

describe("Text align i18n — en", () => {
  it("resolves the text-align label and options, not raw keys", () => {
    const t = ensureI18n("en").getFixedT("en", "common")
    expect(t("properties.textAlign")).toBe("Text align")
    expect(t("properties.textAlign_left")).toBe("Left")
    expect(t("properties.textAlign_center")).toBe("Center")
    expect(t("properties.textAlign_right")).toBe("Right")
  })
})

describe("Text align i18n — ko", () => {
  it("resolves the text-align label and options, not raw keys", () => {
    const t = ensureI18n("ko").getFixedT("ko", "common")
    expect(t("properties.textAlign")).toBe("텍스트 정렬")
    expect(t("properties.textAlign_left")).toBe("왼쪽")
    expect(t("properties.textAlign_center")).toBe("가운데")
    expect(t("properties.textAlign_right")).toBe("오른쪽")
  })
})
