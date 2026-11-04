"use client"
import { getFile } from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import { setTableMeasurer } from "@excalidraw-clone/scene"
import type { i18n as I18n } from "i18next"
import { useEffect } from "react"
import { hydrateUI } from "../driver/hydration"
import { pickAndUploadImage } from "../driver/imageUpload"
import { tableLineCounter } from "../driver/tableOps"
import { useAppStore } from "../store"
import { computeResolvedTheme } from "../store/slices/theme"

/** One-time UI hydration and table measurer, plus keeping the document theme
 *  and the i18n language in sync with the store. */
export function useEditorEnvironment(i18n: I18n): void {
  useEffect(() => {
    hydrateUI()
  }, [])
  // Lets Scene.mutate re-wrap table rows when a column narrows (any path).
  useEffect(() => {
    setTableMeasurer(tableLineCounter)
    return () => setTableMeasurer(null)
  }, [])

  const theme = useAppStore((s) => s.theme)
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = (): void => {
      const resolved = computeResolvedTheme(theme, mql.matches)
      document.documentElement.dataset.theme = resolved
      useAppStore.getState().setResolvedTheme(resolved)
    }
    apply()
    if (theme !== "system") return
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
  }, [theme])

  const locale = useAppStore((s) => s.locale)
  useEffect(() => {
    void i18n.changeLanguage(locale)
    // Screen readers choose their voice and pronunciation from <html lang>.
    document.documentElement.lang = locale
  }, [locale, i18n])
}

/** Selecting the image tool opens the file picker and dispatches the upload. */
export function useImageToolUpload(renderer: CanvasRenderer | null): void {
  const activeTool = useAppStore((s) => s.activeTool)
  useEffect(() => {
    if (activeTool !== "image") return
    let cancelled = false
    void (async () => {
      const event = await pickAndUploadImage({ x: 100, y: 100 })
      if (cancelled || !event) return
      const bin = await getFile(event.fileId)
      if (bin && renderer) void renderer.preloadImage(bin.id, bin.dataURL)
      useAppStore.getState().dispatchToolEvent?.(event)
    })()
    return () => {
      cancelled = true
    }
  }, [activeTool, renderer])
}
