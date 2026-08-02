"use client"
import { zoomToPoint } from "@excalidraw-clone/geometry"
import { renderToSVG } from "@excalidraw-clone/renderer"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import {
  alignElements,
  bringForward,
  bringToFront,
  BUILTIN_TEMPLATES,
  distributeElements,
  duplicateElements,
  expandIdsToGroups,
  type ExcalidrawElement,
  groupElements,
  type LibraryItem,
  lockElements,
  normalizeToOrigin,
  Scene,
  sendBackward,
  sendToBack,
  ungroupElements,
  unlockAll,
} from "@excalidraw-clone/scene"
import {
  HamburgerMenu,
  LayersPanel,
  LibraryPanel,
  PagesTabBar,
  PropertiesPanel,
  Toolbar,
} from "@excalidraw-clone/ui"
import {
  createAutoSaver,
  deleteLibraryItem,
  download,
  exportLibraryFile,
  getAllLibraryItems,
  getFile,
  importLibraryFile,
  putLibraryItem,
  renameLibraryItem,
} from "@excalidraw-clone/persistence"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { startAutoSave } from "../driver/autoSave"
import { hydratePages, hydrateUI } from "../driver/hydration"
import { pickAndUploadImage } from "../driver/imageUpload"
import {
  addPage,
  cyclePageId,
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
import { useSceneRevision } from "../hooks/useSceneRevision"
import { openExcalidrawFromPicker } from "../driver/openFile"
import { patchScene } from "../driver/patchScene"
import { saveAsExcalidraw } from "../driver/saveFile"
import { ensureI18n } from "../i18n"
import { attachClipboard } from "../keyboard/clipboard"
import { attachShortcuts } from "../keyboard/shortcuts"
import { useAppStore } from "../store"
import { computeResolvedTheme } from "../store/slices/theme"
import { CanvasShell } from "./CanvasShell"
import { Dialogs } from "./Dialogs"
import { PaletteHost } from "./PaletteHost"
import { TextEditingOverlay } from "./TextEditingOverlay"

export function App(): React.ReactElement {
  const locale = useAppStore((s) => s.locale)
  const i18n = useMemo(() => ensureI18n(locale), [locale])
  return (
    <I18nextProvider i18n={i18n}>
      <Inner />
    </I18nextProvider>
  )
}

function Inner(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const initialDoc = useMemo(() => hydratePages(), [])
  const [pages, setPages] = useState<PageRecord[]>(initialDoc.pages)
  const [activePageId, setActivePageId] = useState<string>(initialDoc.activePageId)
  const [thumbnails, setThumbnails] = useState<Record<string, string | undefined>>({})
  const scene = useMemo(
    () => pages.find((p) => p.id === activePageId)!.scene,
    [pages, activePageId],
  )
  const canvasBg = useAppStore((s) => s.canvasBg)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  // Read at fire time by the re-theme-all effect below, which must see the live
  // page list without re-running for every unrelated `pages` mutation.
  const pagesRef = useRef<PageRecord[]>(pages)
  pagesRef.current = pages
  const switchToPage = useCallback(
    (targetId: string): void => {
      if (targetId === activePageId) return
      const s = useAppStore.getState()
      setPages(
        withViewport(pages, activePageId, { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }),
      )
      const target = pages.find((p) => p.id === targetId)
      s.setView(target?.viewport ?? DEFAULT_VIEWPORT)
      setActivePageId(targetId)
      s.setSelection([])
      if (target) {
        void renderPageThumbnail(target.scene, canvasBg, resolvedTheme)
          .then((thumb) => {
            setThumbnails((prev) => ({ ...prev, [targetId]: thumb }))
          })
          .catch(() => {
            // Rendering can fail (e.g. SecurityError from a tainted canvas).
            // Leave the previous thumbnail in place rather than blanking it.
          })
      }
    },
    [activePageId, pages, canvasBg, resolvedTheme],
  )
  useEffect(() => {
    hydrateUI()
  }, [])
  useEffect(() => {
    return startAutoSave(pages, activePageId)
  }, [pages, activePageId])
  // Hydrates every page's thumbnail on mount, and re-renders them all whenever
  // the theme or canvas background changes. Deliberately keyed only on those two
  // so adding/renaming/reordering a page does not re-render every thumbnail;
  // the live page list is read from a ref at fire time instead.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        pagesRef.current.map(async (p) => {
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
      const live = new Set(pagesRef.current.map((p) => p.id))
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
      flush: () => {
        void renderPageThumbnail(scene, canvasBg, resolvedTheme)
          .then((thumb) => {
            setThumbnails((prev) => ({ ...prev, [activePageId]: thumb }))
          })
          .catch(() => {
            // Keep the last good thumbnail if this render fails.
          })
      },
    })
    const unsub = scene.subscribe(() => saver.schedule())
    return () => {
      unsub()
      saver.dispose()
    }
  }, [scene, activePageId, canvasBg, resolvedTheme])
  useEffect(() => {
    return attachShortcuts({
      scene,
      onNextPage: () => switchToPage(cyclePageId(pages, activePageId, "next")),
      onPrevPage: () => switchToPage(cyclePageId(pages, activePageId, "prev")),
    })
  }, [scene, pages, activePageId, switchToPage])
  useEffect(() => {
    return attachClipboard({ scene })
  }, [scene])
  const activeTool = useAppStore((s) => s.activeTool)
  const setActiveTool = useAppStore((s) => s.setActiveTool)
  const lockActiveTool = useAppStore((s) => s.lockActiveTool)
  const toggleLockActiveTool = useAppStore((s) => s.toggleLockActiveTool)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const zenMode = useAppStore((s) => s.zenMode)
  const zoom = useAppStore((s) => s.zoom)
  const toggleZenMode = useAppStore((s) => s.toggleZenMode)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const openDialog = useAppStore((s) => s.openDialog)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const libraryItems = useAppStore((s) => s.libraryItems)
  const setLibraryItems = useAppStore((s) => s.setLibraryItems)
  const armLibraryItem = useAppStore((s) => s.armLibraryItem)
  const clearPendingItem = useAppStore((s) => s.clearPendingItem)
  const [menuOpen, setMenuOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [moreShapesOpen, setMoreShapesOpen] = useState(false)
  const [renderer, setRenderer] = useState<CanvasRenderer | null>(null)
  const onRendererReady = useCallback((r: CanvasRenderer): void => setRenderer(r), [])
  const onRendererTeardown = useCallback((): void => setRenderer(null), [])

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

  useEffect(() => {
    void i18n.changeLanguage(locale)
  }, [locale, i18n])

  // Recompute on every scene mutation: the `scene` ref is stable across edits,
  // so without the revision the panel would only refresh on re-selection.
  const sceneRevision = useSceneRevision(scene)
  const selectedElements = useMemo(() => {
    const ids = new Set(selectedIds)
    return scene.getElements().filter((e) => ids.has(e.id))
  }, [selectedIds, scene, sceneRevision])
  const hasLockedElements = useMemo(
    () => scene.getElements().some((e) => e.locked),
    [scene, sceneRevision],
  )
  const layerElements = useMemo(() => scene.getElements(), [scene, sceneRevision])

  useEffect(() => {
    void getAllLibraryItems().then(setLibraryItems)
  }, [setLibraryItems])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") clearPendingItem()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [clearPendingItem])

  useEffect(() => {
    clearPendingItem()
  }, [activeTool, openDialog, clearPendingItem])

  const refreshLibrary = useCallback(async (): Promise<void> => {
    setLibraryItems(await getAllLibraryItems())
  }, [setLibraryItems])

  const handleAddFromSelection = useCallback(async (): Promise<void> => {
    const allEls = scene.getElements()
    const ids = new Set(selectedIds)
    const picked = allEls.filter((e) => ids.has(e.id))
    if (picked.length === 0) return
    const normalized = normalizeToOrigin(picked)
    const fileIds = new Set<string>()
    for (const el of normalized) {
      const fid = (el as { fileId?: string }).fileId
      if (typeof fid === "string") fileIds.add(fid)
    }
    const files: Record<string, NonNullable<LibraryItem["files"]>[string]> = {}
    for (const fid of fileIds) {
      const bin = await getFile(fid)
      if (bin) files[fid] = bin
    }
    const item: LibraryItem = {
      id: crypto.randomUUID(),
      name: `Item ${libraryItems.length + 1}`,
      created: Date.now(),
      elements: normalized,
      ...(Object.keys(files).length > 0 ? { files } : {}),
    }
    await putLibraryItem(item)
    await refreshLibrary()
  }, [scene, selectedIds, libraryItems.length, refreshLibrary])

  const handleImport = useCallback((): void => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".excalidrawlib,application/json"
    input.onchange = async (): Promise<void> => {
      const file = input.files?.[0]
      if (!file) return
      try {
        await importLibraryFile(file)
        await refreshLibrary()
      } catch (err) {
        console.error("Library import failed", err)
      }
    }
    input.click()
  }, [refreshLibrary])

  const handleExport = useCallback(async (): Promise<void> => {
    const blob = await exportLibraryFile()
    const date = new Date().toISOString().slice(0, 10)
    download(blob, `library-${date}.excalidrawlib`)
  }, [])

  const handleRename = useCallback(
    async (id: string, name: string): Promise<void> => {
      await renameLibraryItem(id, name)
      await refreshLibrary()
    },
    [refreshLibrary],
  )

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      await deleteLibraryItem(id)
      await refreshLibrary()
    },
    [refreshLibrary],
  )

  const renderThumbnail = useCallback((item: LibraryItem): string => {
    const tempScene = new Scene(item.elements)
    return renderToSVG(tempScene, { padding: 4 })
  }, [])

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <CanvasShell
        scene={scene}
        onRendererReady={onRendererReady}
        onRendererTeardown={onRendererTeardown}
      />

      {!zenMode && (
        <>
          <div className="absolute left-3 top-3 z-30">
            <HamburgerMenu
              t={t}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              theme={theme}
              onThemeChange={setTheme}
              locale={locale}
              onLocaleChange={setLocale}
              zenMode={zenMode}
              onZenModeToggle={toggleZenMode}
              onOpenFile={() => {
                void (async () => {
                  const data = await openExcalidrawFromPicker(renderer)
                  if (!data) return
                  const opened = pagesFromDocument(data)
                  setPages(opened.pages)
                  setActivePageId(opened.activePageId)
                })()
              }}
              onSaveFile={() => {
                void saveAsExcalidraw(pages, activePageId)
              }}
              onExport={() => setOpenDialog("export")}
              onReset={() => setOpenDialog("reset")}
              onHelp={() => setOpenDialog("help")}
            />
          </div>

          <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2">
            <Toolbar
              t={t}
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              lockActiveTool={lockActiveTool}
              onToggleLock={() => toggleLockActiveTool()}
              moreShapesOpen={moreShapesOpen}
              onMoreShapesOpenChange={setMoreShapesOpen}
            />
          </div>

          <div className="absolute right-3 top-3 z-30">
            <PropertiesPanel
              t={t}
              selectedElements={selectedElements}
              onChange={(patch) => {
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    if (selectedIds.includes(draft[i]!.id)) {
                      draft[i] = { ...draft[i]!, ...patch } as ExcalidrawElement
                    }
                  }
                })
              }}
              onDelete={() => {
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    if (selectedIds.includes(draft[i]!.id)) {
                      draft[i] = { ...draft[i]!, isDeleted: true }
                    }
                  }
                })
                useAppStore.getState().setSelection([])
              }}
              onDuplicate={() => {
                const copies = duplicateElements(scene.getElements(), selectedIds)
                scene.mutate((draft) => {
                  draft.push(...copies)
                })
                useAppStore
                  .getState()
                  .setSelection(
                    copies
                      .filter((c) => !(c.type === "text" && c.containerId !== null))
                      .map((c) => c.id),
                  )
              }}
              onAlign={(edge) => {
                const byId = new Map(alignElements(selectedElements, edge).map((p) => [p.id, p]))
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    const p = byId.get(draft[i]!.id)
                    if (p) draft[i] = { ...draft[i]!, x: p.x, y: p.y }
                  }
                })
              }}
              onDistribute={(axis) => {
                const byId = new Map(
                  distributeElements(selectedElements, axis).map((p) => [p.id, p]),
                )
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    const p = byId.get(draft[i]!.id)
                    if (p) draft[i] = { ...draft[i]!, x: p.x, y: p.y }
                  }
                })
              }}
              onGroup={() => {
                const byId = new Map(
                  groupElements(selectedElements, selectedIds, crypto.randomUUID()).map((el) => [
                    el.id,
                    el,
                  ]),
                )
                if (byId.size === 0) return
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    const p = byId.get(draft[i]!.id)
                    if (p) draft[i] = p
                  }
                })
              }}
              onUngroup={() => {
                const byId = new Map(
                  ungroupElements(selectedElements, selectedIds).map((el) => [el.id, el]),
                )
                if (byId.size === 0) return
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    const p = byId.get(draft[i]!.id)
                    if (p) draft[i] = p
                  }
                })
              }}
              onLock={() => {
                patchScene(scene, lockElements(scene.getElements(), selectedIds))
                useAppStore.getState().setSelection([])
              }}
            />
          </div>

          <LayersPanel
            t={t}
            elements={layerElements}
            selectedIds={selectedIds}
            open={layersOpen}
            onToggle={() => setLayersOpen((v) => !v)}
            onSelect={(id, opts) => {
              const hitIds = expandIdsToGroups([id], scene.getElements())
              if (opts.additive) {
                if (!selectedIds.includes(id)) useAppStore.getState().addToSelection(hitIds)
              } else {
                useAppStore.getState().setSelection(hitIds)
              }
            }}
            onSendToBack={(id) => {
              scene.mutate((draft) => {
                const next = sendToBack(draft, [id])
                draft.length = 0
                draft.push(...next)
              })
            }}
            onSendBackward={(id) => {
              scene.mutate((draft) => {
                const next = sendBackward(draft, [id])
                draft.length = 0
                draft.push(...next)
              })
            }}
            onBringForward={(id) => {
              scene.mutate((draft) => {
                const next = bringForward(draft, [id])
                draft.length = 0
                draft.push(...next)
              })
            }}
            onBringToFront={(id) => {
              scene.mutate((draft) => {
                const next = bringToFront(draft, [id])
                draft.length = 0
                draft.push(...next)
              })
            }}
          />

          <LibraryPanel
            t={t}
            open={libraryOpen}
            onToggle={() => setLibraryOpen((v) => !v)}
            items={libraryItems}
            templates={BUILTIN_TEMPLATES}
            selectedCount={selectedIds.length}
            onAddFromSelection={() => void handleAddFromSelection()}
            onItemClick={armLibraryItem}
            onImport={handleImport}
            onExport={() => void handleExport()}
            onRename={(id, name) => void handleRename(id, name)}
            onDelete={(id) => void handleDelete(id)}
            renderThumbnail={renderThumbnail}
          />

          <PagesTabBar
            t={t}
            pages={pages}
            activePageId={activePageId}
            thumbnails={thumbnails}
            onSwitch={switchToPage}
            onAdd={() => {
              const updated = addPage(pages)
              const created = updated[updated.length - 1]!
              setPages(updated)
              setActivePageId(created.id)
              void renderPageThumbnail(created.scene, canvasBg, resolvedTheme)
                .then((thumb) => {
                  setThumbnails((prev) => ({ ...prev, [created.id]: thumb }))
                })
                .catch(() => {
                  // Leave the cache untouched if this render fails.
                })
            }}
            onDelete={(id) => {
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
            }}
            onRename={(id, name) => setPages(renamePage(pages, id, name))}
            onDuplicate={(id) => {
              const updated = duplicatePage(pages, id)
              const index = pages.findIndex((p) => p.id === id)
              const created = updated[index + 1]!
              setPages(updated)
              setActivePageId(created.id)
              void renderPageThumbnail(created.scene, canvasBg, resolvedTheme)
                .then((thumb) => {
                  setThumbnails((prev) => ({ ...prev, [created.id]: thumb }))
                })
                .catch(() => {
                  // Leave the cache untouched if this render fails.
                })
            }}
            onReorder={(id, direction) => setPages(reorderPage(pages, id, direction))}
            onMove={(id, toIndex) => setPages(movePage(pages, id, toIndex))}
          />

          {hasLockedElements && (
            <button
              type="button"
              data-testid="unlock-all"
              aria-label={t("canvas.unlockAll")}
              onClick={() => patchScene(scene, unlockAll(scene.getElements()))}
              className="absolute bottom-3 left-3 z-30 rounded-lg bg-white px-3 py-2 text-xs shadow"
            >
              🔓 {t("canvas.unlockAll")}
            </button>
          )}

          <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs shadow">
            <button
              type="button"
              data-testid="zoom-out"
              aria-label={t("shortcuts:zoomOut")}
              onClick={() => {
                const s = useAppStore.getState()
                const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
                s.setView(
                  zoomToPoint(
                    { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom },
                    anchor,
                    s.zoom / 1.1,
                  ),
                )
              }}
              className="rounded px-1.5 py-0.5 hover:bg-gray-100"
            >
              −
            </button>
            <button
              type="button"
              data-testid="zoom-reset"
              aria-label={t("shortcuts:zoomReset")}
              onClick={() => {
                const s = useAppStore.getState()
                const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
                s.setView(
                  zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, 1),
                )
              }}
              className="min-w-[3.5rem] rounded px-1.5 py-0.5 text-center hover:bg-gray-100"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              data-testid="zoom-in"
              aria-label={t("shortcuts:zoomIn")}
              onClick={() => {
                const s = useAppStore.getState()
                const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
                s.setView(
                  zoomToPoint(
                    { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom },
                    anchor,
                    s.zoom * 1.1,
                  ),
                )
              }}
              className="rounded px-1.5 py-0.5 hover:bg-gray-100"
            >
              +
            </button>
          </div>
        </>
      )}

      <Dialogs scene={scene} />
      <PaletteHost scene={scene} />
      <TextEditingOverlay scene={scene} />
    </main>
  )
}
