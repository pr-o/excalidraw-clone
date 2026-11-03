"use client"
import { getAllFiles, loadScene, loadUI } from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import { TOOLS, type ToolName } from "@excalidraw-clone/tools"
import type { Locale } from "../store/slices/i18n"
import type { Theme } from "../store/slices/theme"
import { useAppStore } from "../store"
import { createPageRecord, pagesFromDocument, type PageRecord } from "./pages"

export function hydratePages(): { pages: PageRecord[]; activePageId: string } {
  const data = loadScene()
  if (!data) {
    const page = createPageRecord("Page 1")
    return { pages: [page], activePageId: page.id }
  }
  return pagesFromDocument(data)
}

const THEMES: readonly Theme[] = ["light", "dark", "system"]
const LOCALES: readonly Locale[] = ["en", "ko"]

/** Persisted UI can be stale or hand-edited; accept only values the app still understands. */
const isOneOf = <T extends string>(allowed: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v)

export function hydrateUI(): void {
  const ui = loadUI()
  if (!ui) return
  const store = useAppStore.getState()
  if (isOneOf(THEMES, ui.theme)) store.setTheme(ui.theme)
  if (isOneOf(LOCALES, ui.locale)) store.setLocale(ui.locale)
  if (typeof ui.gridEnabled === "boolean" && ui.gridEnabled !== store.gridEnabled) {
    store.toggleGrid()
  }
  if (typeof ui.rulersVisible === "boolean" && ui.rulersVisible !== store.rulersVisible) {
    store.toggleRulers()
  }
  if (typeof ui.minimapVisible === "boolean" && ui.minimapVisible !== store.minimapVisible) {
    store.toggleMinimap()
  }
  if (ui.viewMode === true) store.setViewMode(true)
  if (typeof ui.canvasBg === "string") store.setCanvasBg(ui.canvasBg)
  if (typeof ui.zenMode === "boolean" && ui.zenMode !== store.zenMode) store.toggleZenMode()
  if (isOneOf(Object.keys(TOOLS) as ToolName[], ui.activeTool)) store.setActiveTool(ui.activeTool)
}

export async function preloadFiles(renderer: CanvasRenderer | null): Promise<void> {
  if (!renderer) return
  const files = await getAllFiles()
  for (const f of files) {
    void renderer.preloadImage(f.id, f.dataURL)
  }
}
