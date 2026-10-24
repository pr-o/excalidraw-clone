"use client"
import { clearAllFiles, clearLocal, download } from "@excalidraw-clone/persistence"
import {
  arrayDuplicate,
  type ArrayDuplicateOptions,
  exportMermaidFlowchart,
  layoutFlowchart,
  type MermaidFlowchart,
  type Scene,
} from "@excalidraw-clone/scene"
import {
  ArrayDuplicateDialog,
  ExportDialog,
  HelpDialog,
  MermaidExportDialog,
  MermaidImportDialog,
  ResetCanvasDialog,
  StickerDialog,
  type ExportOptions,
} from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { centerAt, selectableIds } from "../driver/clipboard"
import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
import { buildCombinedPDF } from "../driver/exportPDF"
import { exportToPNG } from "../driver/exportPNG"
import { renderPageBlob } from "../driver/exportRender"
import {
  exportFilename,
  hasExportableSelection,
  resolveExportTarget,
  type ExportTarget,
} from "../driver/exportTarget"
import { buildExportZip } from "../driver/exportZip"
import { insertSticker } from "../driver/stickers"
import type { PageRecord } from "../driver/pages"
import { useAppStore } from "../store"

export interface DialogsProps {
  scene: Scene
  pages: readonly PageRecord[]
  activePageId: string
}

export function Dialogs({ scene, pages, activePageId }: DialogsProps): React.ReactElement {
  const { t } = useTranslation()
  const openDialog = useAppStore((s) => s.openDialog)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const canvasBg = useAppStore((s) => s.canvasBg)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const exportOpen = openDialog === "export"
  // Only computed while the dialog is open; the closure check walks the page.
  const hasSelection = exportOpen && hasExportableSelection(scene.getElements(), selectedIds)

  // A lone selected frame opens the dialog scoped to it ("Export frame…").
  const frameSelected =
    hasSelection &&
    selectedIds.length === 1 &&
    scene.getElements().some((e) => e.id === selectedIds[0] && e.type === "frame")

  const targetFor = (opts: ExportOptions): ExportTarget =>
    resolveExportTarget(pages, activePageId, selectedIds, opts)

  const onExport = (opts: ExportOptions): void => {
    if (opts.allPages) {
      void exportAllPages(pages, opts, canvasBg)
    } else {
      void exportImage(targetFor(opts), opts, canvasBg)
    }
    setOpenDialog(null)
  }

  // Must stay synchronous up to the clipboard.write call (user activation):
  // copyPNGToClipboard issues the write before awaiting the render.
  const onCopy = (opts: ExportOptions): Promise<void> => {
    const target = targetFor(opts)
    return copyPNGToClipboard(() => exportToPNG(target.elements, opts, canvasBg, target.pageName))
  }

  const onResetConfirm = (): void => {
    scene.mutate((draft) => {
      draft.length = 0
    })
    clearLocal()
    void clearAllFiles()
    useAppStore.getState().setSelection([])
    setOpenDialog(null)
  }

  // Same insert-and-select path as paste: one mutate (one undo step), centered on the viewport.
  const onMermaidInsert = (chart: MermaidFlowchart): void => {
    const store = useAppStore.getState()
    const at = {
      x: window.innerWidth / 2 / store.zoom - store.scrollX,
      y: window.innerHeight / 2 / store.zoom - store.scrollY,
    }
    const inserted = centerAt(layoutFlowchart(chart), at)
    scene.mutate((draft) => {
      draft.push(...inserted)
    })
    store.setSelection(selectableIds(inserted))
    setOpenDialog(null)
  }

  // One mutate = one undo step; the whole array (originals + copies) ends up selected.
  const onArrayDuplicate = (opts: ArrayDuplicateOptions): void => {
    const store = useAppStore.getState()
    const copies = arrayDuplicate(scene.getElements(), store.selectedIds, opts)
    if (copies.length > 0) {
      scene.mutate((draft) => {
        draft.push(...copies)
      })
      const locked = new Set(
        scene
          .getElements()
          .filter((e) => e.locked)
          .map((e) => e.id),
      )
      store.setSelection([
        ...store.selectedIds.filter((id) => !locked.has(id)),
        ...selectableIds(copies),
      ])
    }
    setOpenDialog(null)
  }

  return (
    <>
      <ArrayDuplicateDialog
        t={t}
        open={openDialog === "array-duplicate"}
        onClose={() => setOpenDialog(null)}
        onConfirm={onArrayDuplicate}
      />
      <HelpDialog t={t} open={openDialog === "help"} onClose={() => setOpenDialog(null)} />
      <ExportDialog
        t={t}
        open={exportOpen}
        onClose={() => setOpenDialog(null)}
        onExport={onExport}
        onCopy={onCopy}
        pages={pages.map((p) => ({ id: p.id, name: p.name }))}
        activePageId={activePageId}
        hasSelection={hasSelection}
        defaultScope={frameSelected ? "selection" : "page"}
        defaultBackground={resolvedTheme === "dark" ? "dark" : "white"}
      />
      <MermaidImportDialog
        t={t}
        open={openDialog === "mermaid-import"}
        onClose={() => setOpenDialog(null)}
        onInsert={onMermaidInsert}
      />
      <MermaidExportDialog
        t={t}
        open={openDialog === "mermaid-export"}
        onClose={() => setOpenDialog(null)}
        text={
          openDialog === "mermaid-export"
            ? exportMermaidFlowchart(scene.getElements(), selectedIds)
            : ""
        }
      />
      <StickerDialog
        t={t}
        open={openDialog === "stickers"}
        onClose={() => setOpenDialog(null)}
        onPick={(emoji) => {
          insertSticker(scene, emoji)
          setOpenDialog(null)
        }}
      />
      <ResetCanvasDialog
        t={t}
        open={openDialog === "reset"}
        onClose={() => setOpenDialog(null)}
        onConfirm={onResetConfirm}
      />
    </>
  )
}

async function exportImage(
  target: ExportTarget,
  opts: ExportOptions,
  canvasBg: string,
): Promise<void> {
  const filename = exportFilename(target.pageName, target.scope, opts.format)
  download(
    await renderPageBlob(opts.format, target.elements, opts, canvasBg, target.pageName),
    filename,
  )
}

async function exportAllPages(
  pages: readonly PageRecord[],
  opts: ExportOptions,
  canvasBg: string,
): Promise<void> {
  // PDF has real pages, so all pages go into one PDF; images go into a zip.
  if (opts.format === "pdf") {
    download(await buildCombinedPDF(pages, opts, canvasBg), "export.pdf")
    return
  }
  download(await buildExportZip(pages, opts, canvasBg), "export.zip")
}
