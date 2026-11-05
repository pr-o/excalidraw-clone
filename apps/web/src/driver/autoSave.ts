"use client"
import {
  createAutoSaver,
  saveScene,
  saveUI,
  serializeDocument,
} from "@excalidraw-clone/persistence"
import i18next from "i18next"
import { notify } from "../components/LiveAnnouncer"
import type { ExcalidrawData } from "@excalidraw-clone/scene"
import { useAppStore } from "../store"
import type { PageRecord } from "./pages"

export interface AutoSave {
  stop: () => void
  /** True while document edits are waiting to be written. */
  hasPendingSave: () => boolean
}

/**
 * Persists the document and UI preferences as they change.
 *
 * `saveOnStart: false` skips the initial write — used right after adopting the
 * document another tab saved, which must not be written straight back (the other
 * tab would adopt it again, and so on).
 */
export function startAutoSave(
  pages: readonly PageRecord[],
  activePageId: string,
  {
    saveOnStart = true,
    onSaved,
  }: {
    saveOnStart?: boolean
    /** Called with each document successfully written. */
    onSaved?: (doc: ExcalidrawData) => void
  } = {},
): AutoSave {
  // Two savers: the document (large on big scenes) is re-serialized only when a
  // Scene changes, not on every pan/zoom/selection store update.
  // Tell the user once per failure streak (not on every retry) when the browser
  // refuses the write, e.g. localStorage quota exceeded on a very large drawing.
  let saveFailing = false
  const sceneSaver = createAutoSaver({
    delayMs: 500,
    flush: () => {
      const doc = serializeDocument(pages, activePageId)
      const ok = saveScene(doc)
      if (ok) onSaved?.(doc)
      if (!ok && !saveFailing) notify(i18next.t("a11y.saveFailed"))
      saveFailing = !ok
    },
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
        measurementsVisible: s.measurementsVisible,
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
  if (saveOnStart) sceneSaver.schedule()
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
  // Moving to another window (perhaps another tab of this app) writes pending edits
  // first, so that tab adopts them instead of overwriting them.
  window.addEventListener("blur", onBeforeUnload)
  document.addEventListener("visibilitychange", onVisibilityChange)

  const stop = (): void => {
    for (const unsub of unsubScenes) unsub()
    unsubStore()
    window.removeEventListener("beforeunload", onBeforeUnload)
    window.removeEventListener("pagehide", onBeforeUnload)
    window.removeEventListener("blur", onBeforeUnload)
    document.removeEventListener("visibilitychange", onVisibilityChange)
    sceneSaver.dispose()
    uiSaver.dispose()
  }
  return { stop, hasPendingSave: () => sceneSaver.isPending() }
}
