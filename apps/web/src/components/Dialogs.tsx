"use client"
import { clearAllFiles, clearLocal, download, getFile } from "@excalidraw-clone/persistence"
import { renderToSVG } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
import {
  CanvasBgDialog,
  ExportDialog,
  HelpDialog,
  ResetCanvasDialog,
  type ExportOptions,
} from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { exportToPNG } from "../driver/exportPNG"
import { useAppStore } from "../store"

export function Dialogs({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useTranslation()
  const openDialog = useAppStore((s) => s.openDialog)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const canvasBg = useAppStore((s) => s.canvasBg)
  const setCanvasBg = useAppStore((s) => s.setCanvasBg)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)

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
        open={openDialog === "export"}
        onClose={() => setOpenDialog(null)}
        onExport={onExport}
        defaultBackground={resolvedTheme === "dark" ? "dark" : "white"}
      />
      <ResetCanvasDialog
        t={t}
        open={openDialog === "reset"}
        onClose={() => setOpenDialog(null)}
        onConfirm={onResetConfirm}
      />
      <CanvasBgDialog
        t={t}
        open={openDialog === "canvasBg"}
        onClose={() => setOpenDialog(null)}
        value={canvasBg}
        onChange={setCanvasBg}
      />
    </>
  )
}

async function exportScene(scene: Scene, opts: ExportOptions, canvasBg: string): Promise<void> {
  const theme = opts.background === "dark" ? "dark" : "light"
  const background = opts.background === "transparent" ? "transparent" : canvasBg
  if (opts.format === "svg") {
    const files = new Map<string, string>()
    for (const el of scene.getElements()) {
      if (el.type === "image" && el.fileId !== null && !files.has(el.fileId)) {
        const bin = await getFile(el.fileId)
        if (bin) files.set(el.fileId, bin.dataURL)
      }
    }
    const svg = renderToSVG(scene, { background, theme, files })
    const blob = new Blob([svg], { type: "image/svg+xml" })
    download(blob, "drawing.svg")
    return
  }
  const blob = await exportToPNG(scene, opts, canvasBg)
  download(blob, "drawing.png")
}
