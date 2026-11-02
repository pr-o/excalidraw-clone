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
  )
}
