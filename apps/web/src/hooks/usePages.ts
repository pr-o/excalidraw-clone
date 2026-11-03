"use client"
import { collectUnreferencedFiles, createAutoSaver } from "@excalidraw-clone/persistence"
import type { ExcalidrawData, Scene } from "@excalidraw-clone/scene"
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react"
import { startAutoSave } from "../driver/autoSave"
import { hydratePages } from "../driver/hydration"
import {
  addPage,
  deletePage,
  DEFAULT_VIEWPORT,
  duplicatePage,
  movePage,
  pagesFromDocument,
  renamePage,
  reorderPage,
  withViewport,
  type PageRecord,
} from "../driver/pages"
import { renderPageThumbnail } from "../driver/pageThumbnails"
import { replaceElements } from "../driver/patchScene"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"

export interface PagesState {
  pages: PageRecord[]
  activePageId: string
  /** The active page's scene. */
  scene: Scene
  thumbnails: Record<string, string | undefined>
  switchToPage: (targetId: string) => void
  /** Swap in a whole document (all pages) with fresh Scenes, e.g. opening a file. */
  loadDocument: (data: ExcalidrawData) => void
  addPage: () => void
  deletePage: (id: string) => void
  duplicatePage: (id: string) => void
  renamePage: (id: string, name: string) => void
  reorderPage: (id: string, direction: Parameters<typeof reorderPage>[2]) => void
  movePage: (id: string, toIndex: number) => void
  moveElementToPage: (elementId: string, targetPageId: string) => void
}

/** The multi-page document: page list, active page, thumbnails and autosave. */
export function usePages(): PagesState {
  const initialDoc = useMemo(() => hydratePages(), [])
  const [pages, setPages] = useState<PageRecord[]>(initialDoc.pages)
  const [activePageId, setActivePageId] = useState<string>(initialDoc.activePageId)
  // Once per page load, drop stored images nothing references any more. Skipped on a
  // fresh start or unreadable storage: with no document to compare against, every
  // stored image would look unused.
  useEffect(() => {
    if (!initialDoc.restored) return
    void collectUnreferencedFiles(
      initialDoc.pages.map((p) => p.scene.getElementsIncludingDeleted()),
    ).catch(() => {})
  }, [initialDoc])
  const [thumbnails, setThumbnails] = useState<Record<string, string | undefined>>({})
  const scene = useMemo(
    () => pages.find((p) => p.id === activePageId)!.scene,
    [pages, activePageId],
  )
  const canvasBg = useAppStore((s) => s.canvasBg)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  // Re-render one page's thumbnail; a failed render (e.g. a tainted canvas)
  // keeps the last good thumbnail rather than blanking it.
  const refreshThumbnail = useCallback(
    (pageScene: Scene, pageId: string): void => {
      void renderPageThumbnail(pageScene, canvasBg, resolvedTheme)
        .then((thumb) => setThumbnails((prev) => ({ ...prev, [pageId]: thumb })))
        .catch(() => {})
    },
    [canvasBg, resolvedTheme],
  )
  const switchToPage = useCallback(
    (targetId: string): void => {
      if (targetId === activePageId) return
      const s = useAppStore.getState()
      setPages(withViewport(pages, activePageId, viewOf(s)))
      const target = pages.find((p) => p.id === targetId)
      s.setView(target?.viewport ?? DEFAULT_VIEWPORT)
      setActivePageId(targetId)
      s.setSelection([])
      if (target) refreshThumbnail(target.scene, targetId)
    },
    [activePageId, pages, refreshThumbnail],
  )
  useEffect(() => {
    return startAutoSave(pages, activePageId)
  }, [pages, activePageId])
  // The live page list, read when the re-theme pass below starts and again when it
  // finishes. Effect Events always see current values, so that pass re-runs only on a
  // theme/background change — not for every page added, renamed or reordered.
  const currentPages = useEffectEvent((): readonly PageRecord[] => pages)
  // Hydrates every page's thumbnail on mount, and re-renders them all whenever
  // the theme or canvas background changes.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        currentPages().map(async (p) => {
          try {
            return [p.id, await renderPageThumbnail(p.scene, canvasBg, resolvedTheme)] as const
          } catch {
            // Keep this page's existing thumbnail rather than blanking it.
            return null
          }
        }),
      )
      if (cancelled) return
      // Only touch pages that still exist, so a delete's cache removal is never
      // undone and a removed page's Scene is not kept reachable.
      const live = new Set(currentPages().map((p) => p.id))
      setThumbnails((prev) => {
        const next: Record<string, string | undefined> = {}
        for (const [id, thumb] of Object.entries(prev)) {
          if (live.has(id)) next[id] = thumb
        }
        for (const entry of entries) {
          if (entry && live.has(entry[0])) next[entry[0]] = entry[1]
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [canvasBg, resolvedTheme])
  useEffect(() => {
    const saver = createAutoSaver({
      delayMs: 500,
      flush: () => refreshThumbnail(scene, activePageId),
    })
    const unsub = scene.subscribe(() => saver.schedule())
    return () => {
      unsub()
      saver.dispose()
    }
  }, [scene, activePageId, refreshThumbnail])
  // Any page change (tab switch, Alt+PageUp/Down, opening a file) must drop a
  // stale editor id from the previous page — same reasoning the codebase applies
  // to textEditElementId. Keyed on activePageId so every path is covered.
  useEffect(() => {
    useAppStore.getState().setLinkEditorElementId(null)
  }, [activePageId])

  const moveElementToPage = useCallback(
    (elementId: string, targetPageId: string): void => {
      const element = scene.getElements().find((el) => el.id === elementId)
      const target = pages.find((p) => p.id === targetPageId)
      if (!element || !target) return
      replaceElements(scene, (el) => (el.id === elementId ? { ...el, isDeleted: true } : undefined))
      target.scene.mutate((draft) => {
        draft.push(element)
      })
      // The per-active-page thumbnail-flush effect above is subscribed to the
      // *source* scene at this point (we haven't switched pages yet) but gets
      // torn down by switchToPage's setActivePageId before its 500ms debounce
      // fires, so it never runs for this mutation. Refresh the source page's
      // thumbnail explicitly, the same way addPage/duplicatePage below refresh a
      // freshly created page's.
      refreshThumbnail(scene, activePageId)
      switchToPage(targetPageId)
      useAppStore.getState().setSelection([elementId])
    },
    [scene, pages, activePageId, refreshThumbnail, switchToPage],
  )

  return {
    pages,
    activePageId,
    scene,
    thumbnails,
    switchToPage,
    loadDocument: (data) => {
      const opened = pagesFromDocument(data)
      setPages(opened.pages)
      setActivePageId(opened.activePageId)
      // The thumbnail effect only re-runs on theme/background changes, so a freshly
      // opened (or restored) document's tabs would stay blank until visited.
      setThumbnails({})
      for (const page of opened.pages) refreshThumbnail(page.scene, page.id)
    },
    addPage: () => {
      const updated = addPage(pages)
      const created = updated[updated.length - 1]!
      setPages(updated)
      setActivePageId(created.id)
      refreshThumbnail(created.scene, created.id)
    },
    deletePage: (id) => {
      if (id === activePageId) {
        const fallback = pages.find((p) => p.id !== id)
        if (fallback) switchToPage(fallback.id)
      }
      setPages(deletePage(pages, id))
      setThumbnails((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    },
    duplicatePage: (id) => {
      const updated = duplicatePage(pages, id)
      const index = pages.findIndex((p) => p.id === id)
      const created = updated[index + 1]!
      setPages(updated)
      setActivePageId(created.id)
      refreshThumbnail(created.scene, created.id)
    },
    renamePage: (id, name) => setPages(renamePage(pages, id, name)),
    reorderPage: (id, direction) => setPages(reorderPage(pages, id, direction)),
    movePage: (id, toIndex) => setPages(movePage(pages, id, toIndex)),
    moveElementToPage,
  }
}
