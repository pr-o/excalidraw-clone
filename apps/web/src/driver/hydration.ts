"use client"
import { getAllFiles, loadScene, loadUI } from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { ToolName } from "@excalidraw-clone/tools"
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

export function hydrateUI(): void {
  const ui = loadUI()
  if (!ui) return
  const store = useAppStore.getState()
  if (typeof ui.theme === "string") store.setTheme(ui.theme as Theme)
  if (typeof ui.locale === "string") store.setLocale(ui.locale as Locale)
  if (typeof ui.gridEnabled === "boolean" && ui.gridEnabled !== store.gridEnabled) {
    store.toggleGrid()
  }
  if (typeof ui.canvasBg === "string") store.setCanvasBg(ui.canvasBg)
  if (typeof ui.zenMode === "boolean" && ui.zenMode !== store.zenMode) store.toggleZenMode()
  if (typeof ui.activeTool === "string") store.setActiveTool(ui.activeTool as ToolName)
}

export async function preloadFiles(renderer: CanvasRenderer | null): Promise<void> {
  if (!renderer) return
  const files = await getAllFiles()
  for (const f of files) {
    void renderer.preloadImage(f.id, f.dataURL)
  }
}
