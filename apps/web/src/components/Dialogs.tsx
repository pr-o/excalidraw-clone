"use client"
import { clearAllFiles, clearLocal, download } from "@excalidraw-clone/persistence"
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

  const onExport = (opts: ExportOptions): void => {
    void exportScene(scene, opts)
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

async function exportScene(scene: Scene, opts: ExportOptions): Promise<void> {
  // SVG draw is deferred to v1.1; fall back to PNG if requested.
  const pngOpts: ExportOptions = opts.format === "png" ? opts : { ...opts, format: "png" }
  const blob = await exportToPNG(scene, pngOpts)
  download(blob, "drawing.png")
}
