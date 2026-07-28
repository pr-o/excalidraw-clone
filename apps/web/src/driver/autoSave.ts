"use client"
import {
  createAutoSaver,
  saveScene,
  saveUI,
  serializeDocument,
} from "@excalidraw-clone/persistence"
import { useAppStore } from "../store"
import type { PageRecord } from "./pages"

export function startAutoSave(pages: readonly PageRecord[], activePageId: string): () => void {
  const saver = createAutoSaver({
    delayMs: 500,
    flush: () => {
      saveScene(serializeDocument(pages, activePageId))
      const s = useAppStore.getState()
      saveUI({
        theme: s.theme,
        locale: s.locale,
        gridEnabled: s.gridEnabled,
        gridSize: s.gridSize,
        canvasBg: s.canvasBg,
        zenMode: s.zenMode,
        activeTool: s.activeTool,
      })
    },
  })

  const unsubScenes = pages.map((p) => p.scene.subscribe(() => saver.schedule()))
  const unsubStore = useAppStore.subscribe(() => saver.schedule())

  // Opening a file swaps in freshly-built Scenes rather than mutating the
  // existing one, so no subscriber fires for the new document. Schedule once up
  // front so a newly loaded document is persisted without waiting for an edit.
  saver.schedule()

  const onBeforeUnload = (): void => saver.flushNow()
  window.addEventListener("beforeunload", onBeforeUnload)

  return () => {
    for (const unsub of unsubScenes) unsub()
    unsubStore()
    window.removeEventListener("beforeunload", onBeforeUnload)
    saver.dispose()
  }
}
