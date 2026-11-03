import { saveUI } from "@excalidraw-clone/persistence"
import { beforeEach, describe, expect, it } from "vitest"
import { hydrateUI } from "../src/driver/hydration"
import { useAppStore } from "../src/store"

describe("hydrateUI", () => {
  beforeEach(() => {
    localStorage.clear()
    useAppStore.getState().setTheme("system")
    useAppStore.getState().setLocale("en")
    useAppStore.getState().setActiveTool("selection")
  })

  it("restores valid persisted theme, locale and tool", () => {
    saveUI({ theme: "dark", locale: "ko", activeTool: "rectangle" })
    hydrateUI()
    const s = useAppStore.getState()
    expect([s.theme, s.locale, s.activeTool]).toEqual(["dark", "ko", "rectangle"])
  })

  it("ignores values the app no longer understands", () => {
    saveUI({ theme: "sepia", locale: "fr", activeTool: "teleport" })
    hydrateUI()
    const s = useAppStore.getState()
    expect([s.theme, s.locale, s.activeTool]).toEqual(["system", "en", "selection"])
  })
})
