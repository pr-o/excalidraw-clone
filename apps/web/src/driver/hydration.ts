"use client"
import { getAllFiles, loadScene, loadUI } from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import { Scene } from "@excalidraw-clone/scene"
import type { ToolName } from "@excalidraw-clone/tools"
import type { Locale } from "../store/slices/i18n"
import type { Theme } from "../store/slices/theme"
import { useAppStore } from "../store"

export function hydrateScene(): Scene {
  const data = loadScene()
  if (!data) return new Scene()
  return new Scene(data.elements)
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
    const fn = (renderer as unknown as { preloadImage?: (id: string, url: string) => void })
      .preloadImage
    fn?.call(renderer, f.id, f.dataURL)
  }
}
