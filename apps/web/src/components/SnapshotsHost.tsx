"use client"
import {
  deleteSnapshot,
  listSnapshots,
  loadSnapshot,
  saveSnapshot,
  serializeDocument,
  type SnapshotMeta,
} from "@excalidraw-clone/persistence"
import type { ExcalidrawData } from "@excalidraw-clone/scene"
import { SnapshotsDialog } from "@excalidraw-clone/ui"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { PageRecord } from "../driver/pages"
import { useAppStore } from "../store"

export interface SnapshotsHostProps {
  pages: readonly PageRecord[]
  activePageId: string
  /** Swaps in the whole document (all pages), like opening a file. */
  onRestore: (data: ExcalidrawData) => void
}

export function SnapshotsHost({
  pages,
  activePageId,
  onRestore,
}: SnapshotsHostProps): React.ReactElement {
  const { t } = useTranslation()
  const open = useAppStore((s) => s.openDialog === "snapshots")
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const refresh = useCallback(async () => setSnapshots(await listSnapshots()), [])

  // Load the list each time the dialog opens; a response that lands after it
  // closed again is dropped.
  useEffect(() => {
    if (!open) return
    let current = true
    void listSnapshots().then((list) => {
      if (current) setSnapshots(list)
    })
    return () => {
      current = false
    }
  }, [open])

  const current = (): ExcalidrawData => serializeDocument(pages, activePageId)

  return (
    <SnapshotsDialog
      t={t}
      open={open}
      onClose={() => setOpenDialog(null)}
      snapshots={snapshots}
      onSave={(name) => saveSnapshot(name, current()).then(refresh)}
      onDelete={(id) => void deleteSnapshot(id).then(refresh)}
      onRestore={(id) => {
        void (async () => {
          const data = await loadSnapshot(id)
          if (!data) return
          // Checkpoint first so the restore itself can be reversed from this list.
          await saveSnapshot(t("snapshots.beforeRestore"), current())
          onRestore(data)
          setOpenDialog(null)
        })()
      }}
    />
  )
}
