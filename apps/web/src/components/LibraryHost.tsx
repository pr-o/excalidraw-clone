"use client"
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
import { renderToSVG } from "@excalidraw-clone/renderer"
import {
  BUILTIN_TEMPLATES,
  type LibraryItem,
  normalizeToOrigin,
  Scene,
} from "@excalidraw-clone/scene"
import { LibraryPanel, type PanelSibling } from "@excalidraw-clone/ui"
import { useCallback, useEffect } from "react"
import i18next from "i18next"
import { notify } from "./LiveAnnouncer"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../store"

export interface LibraryHostProps {
  scene: Scene
  open: boolean
  onToggle: () => void
  sibling?: PanelSibling | undefined
}

/** Keeps library state in sync while the editor is mounted (whether or not the
 *  panel is shown): items load on mount, and an armed item is dropped on
 *  Escape, a tool switch or a dialog opening. */
export function useLibrarySync(): void {
  const activeTool = useAppStore((s) => s.activeTool)
  const openDialog = useAppStore((s) => s.openDialog)
  const setLibraryItems = useAppStore((s) => s.setLibraryItems)
  const clearPendingItem = useAppStore((s) => s.clearPendingItem)

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
}

/** Library panel wired to persistence. */
export function LibraryHost({
  scene,
  open,
  onToggle,
  sibling,
}: LibraryHostProps): React.ReactElement {
  const { t } = useTranslation()
  const selectedIds = useAppStore((s) => s.selectedIds)
  const libraryItems = useAppStore((s) => s.libraryItems)
  const setLibraryItems = useAppStore((s) => s.setLibraryItems)
  const armLibraryItem = useAppStore((s) => s.armLibraryItem)
  const placing = useAppStore((s) => s.pendingItem !== null)

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
        const { added, skipped } = await importLibraryFile(file)
        await refreshLibrary()
        notify(i18next.t("library.imported", { added, skipped }))
      } catch {
        notify(i18next.t("library.importError"))
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

  // Thumbnails sit on the themed panel, so draw them with the canvas's theme
  // colours (dark strokes would vanish on the dark tile).
  const theme = useAppStore((s) => s.resolvedTheme)
  const renderThumbnail = useCallback(
    (item: LibraryItem): string => renderToSVG(new Scene(item.elements), { padding: 4, theme }),
    [theme],
  )

  return (
    <>
      {placing && (
        <div
          role="status"
          data-testid="library-placing-hint"
          className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-panel px-4 py-1.5 text-xs shadow-panel"
        >
          {t("library.placing")}
        </div>
      )}
      <LibraryPanel
        t={t}
        open={open}
        onToggle={onToggle}
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
        sibling={sibling}
      />
    </>
  )
}
