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
  // Two savers: the document (large on big scenes) is re-serialized only when a
  // Scene changes, not on every pan/zoom/selection store update.
  const sceneSaver = createAutoSaver({
    delayMs: 500,
    flush: () => saveScene(serializeDocument(pages, activePageId)),
  })
  const uiSaver = createAutoSaver({
    delayMs: 500,
    flush: () => {
      const s = useAppStore.getState()
      saveUI({
        theme: s.theme,
        locale: s.locale,
        gridEnabled: s.gridEnabled,
        gridSize: s.gridSize,
        rulersVisible: s.rulersVisible,
        minimapVisible: s.minimapVisible,
        canvasBg: s.canvasBg,
        zenMode: s.zenMode,
        viewMode: s.viewMode,
        activeTool: s.activeTool,
      })
    },
  })

  const unsubScenes = pages.map((p) => p.scene.subscribe(() => sceneSaver.schedule()))
  const unsubStore = useAppStore.subscribe(() => uiSaver.schedule())

  // Opening a file swaps in freshly-built Scenes rather than mutating the
  // existing one, so no subscriber fires for the new document. Schedule once up
  // front so a newly loaded document is persisted without waiting for an edit.
  sceneSaver.schedule()
  uiSaver.schedule()

  const onBeforeUnload = (): void => {
    sceneSaver.flushNow()
    uiSaver.flushNow()
  }
  // `beforeunload` is unreliable on mobile browsers (and skipped when a tab is
  // discarded), so also flush whenever the page is hidden or being stored.
  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") onBeforeUnload()
  }
  window.addEventListener("beforeunload", onBeforeUnload)
  window.addEventListener("pagehide", onBeforeUnload)
  document.addEventListener("visibilitychange", onVisibilityChange)

  return () => {
    for (const unsub of unsubScenes) unsub()
    unsubStore()
    window.removeEventListener("beforeunload", onBeforeUnload)
    window.removeEventListener("pagehide", onBeforeUnload)
    document.removeEventListener("visibilitychange", onVisibilityChange)
    sceneSaver.dispose()
    uiSaver.dispose()
  }
}
