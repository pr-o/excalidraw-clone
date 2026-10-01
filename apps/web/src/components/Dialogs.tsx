"use client"
import { clearAllFiles, clearLocal, download } from "@excalidraw-clone/persistence"
import type { Scene } from "@excalidraw-clone/scene"
import {
  ExportDialog,
  HelpDialog,
  ResetCanvasDialog,
  type ExportOptions,
} from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { exportToPNG } from "../driver/exportPNG"
import { renderExportSVG } from "../driver/exportSVG"
import { hasExportableSelection } from "../driver/exportTarget"
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

  const onExport = (opts: ExportOptions): void => {
    void exportScene(scene, opts, canvasBg)
    setOpenDialog(null)
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

  return (
    <>
      <HelpDialog t={t} open={openDialog === "help"} onClose={() => setOpenDialog(null)} />
      <ExportDialog
        t={t}
        open={exportOpen}
        onClose={() => setOpenDialog(null)}
        onExport={onExport}
        pages={pages.map((p) => ({ id: p.id, name: p.name }))}
        activePageId={activePageId}
        hasSelection={hasSelection}
        defaultBackground={resolvedTheme === "dark" ? "dark" : "white"}
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

async function exportScene(scene: Scene, opts: ExportOptions, canvasBg: string): Promise<void> {
  const elements = scene.getElements()
  if (opts.format === "svg") {
    const svg = await renderExportSVG(elements, opts, canvasBg)
    download(new Blob([svg], { type: "image/svg+xml" }), "drawing.svg")
    return
  }
  download(await exportToPNG(elements, opts, canvasBg), "drawing.png")
}
