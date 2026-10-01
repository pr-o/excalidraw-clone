import { describe, expect, it } from "vitest"
import { ensureI18n } from "../src/i18n"

// `ensureI18n` initializes a module-level singleton, so tests read through
// `getFixedT(locale)` instead of switching the active language (which is async).

describe("Export dialog i18n — en", () => {
  it("resolves the page/scope/copy strings, not raw keys", () => {
    const t = ensureI18n("en").getFixedT("en", "common")
    expect(t("export.page")).toBe("Page")
    expect(t("export.scope")).toBe("Content")
    expect(t("export.scopePage")).toBe("Whole page")
    expect(t("export.scopeSelection")).toBe("Selection only")
    expect(t("export.copy")).toBe("Copy to clipboard")
    expect(t("export.copied")).toBe("Copied to clipboard")
    expect(t("export.copyFailed")).toBe(
      "Couldn't copy to the clipboard. Your browser may not allow it — use Export instead.",
    )
  })
})

describe("Export dialog i18n — ko", () => {
  it("resolves the page/scope/copy strings, not raw keys", () => {
    const t = ensureI18n("ko").getFixedT("ko", "common")
    expect(t("export.page")).toBe("페이지")
    expect(t("export.scope")).toBe("내용")
    expect(t("export.scopePage")).toBe("페이지 전체")
    expect(t("export.scopeSelection")).toBe("선택 항목만")
    expect(t("export.copy")).toBe("클립보드에 복사")
    expect(t("export.copied")).toBe("클립보드에 복사했습니다")
    expect(t("export.copyFailed")).toBe(
      "클립보드에 복사하지 못했습니다. 브라우저에서 허용하지 않을 수 있습니다. 대신 내보내기를 사용하세요.",
    )
  })
})
