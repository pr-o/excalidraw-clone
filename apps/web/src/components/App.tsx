"use client"
import { zoomToPoint } from "@excalidraw-clone/geometry"
import { renderToSVG } from "@excalidraw-clone/renderer"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import {
  alignElements,
  BUILTIN_TEMPLATES,
  cloneElementsWithNewIds,
  distributeElements,
  expandIdsToCopyClosure,
  type ExcalidrawElement,
  groupElements,
  type LibraryItem,
  lockElements,
  normalizeToOrigin,
  Scene,
  ungroupElements,
  unlockAll,
} from "@excalidraw-clone/scene"
import { HamburgerMenu, LibraryPanel, PropertiesPanel, Toolbar } from "@excalidraw-clone/ui"
import {
  deleteLibraryItem,
  download,
  exportLibraryFile,
  getAllLibraryItems,
  getFile,
  importLibraryFile,
  putLibraryItem,
  renameLibraryItem,
} from "@excalidraw-clone/persistence"
import { useCallback, useEffect, useMemo, useState } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { startAutoSave } from "../driver/autoSave"
import { hydrateScene, hydrateUI } from "../driver/hydration"
import { pickAndUploadImage } from "../driver/imageUpload"
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
  const scene = useMemo(() => hydrateScene(), [])
  useEffect(() => {
    hydrateUI()
  }, [])
  useEffect(() => {
    return startAutoSave(scene)
  }, [scene])
  useEffect(() => {
    return attachShortcuts({ scene })
  }, [scene])
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
                void openExcalidrawFromPicker(scene, renderer)
              }}
              onSaveFile={() => {
                void saveAsExcalidraw(scene)
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
                const picked = expandIdsToCopyClosure(selectedIds, scene.getElements())
                const copies = cloneElementsWithNewIds(picked).map((el) => ({
                  ...el,
                  x: el.x + 12,
                  y: el.y + 12,
                }))
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
              onSendToBack={() => {
                scene.mutate((draft) => {
                  const moved = draft.filter((e) => selectedIds.includes(e.id))
                  const remaining = draft.filter((e) => !selectedIds.includes(e.id))
                  draft.length = 0
                  draft.push(...moved, ...remaining)
                })
              }}
              onSendBackward={() => {
                scene.mutate((draft) => {
                  for (let i = 1; i < draft.length; i += 1) {
                    if (
                      selectedIds.includes(draft[i]!.id) &&
                      !selectedIds.includes(draft[i - 1]!.id)
                    ) {
                      ;[draft[i - 1], draft[i]] = [draft[i]!, draft[i - 1]!]
                    }
                  }
                })
              }}
              onBringForward={() => {
                scene.mutate((draft) => {
                  for (let i = draft.length - 2; i >= 0; i -= 1) {
                    if (
                      selectedIds.includes(draft[i]!.id) &&
                      !selectedIds.includes(draft[i + 1]!.id)
                    ) {
                      ;[draft[i + 1], draft[i]] = [draft[i]!, draft[i + 1]!]
                    }
                  }
                })
              }}
              onBringToFront={() => {
                scene.mutate((draft) => {
                  const moved = draft.filter((e) => selectedIds.includes(e.id))
                  const remaining = draft.filter((e) => !selectedIds.includes(e.id))
                  draft.length = 0
                  draft.push(...remaining, ...moved)
                })
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
