import { useState } from "react"
import { Dialog } from "./shared/Dialog"

export interface SnapshotListItem {
  id: string
  name: string
  createdAt: number
}

export interface SnapshotsDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  snapshots: readonly SnapshotListItem[]
  onSave: (name: string) => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}

export function SnapshotsDialog(props: SnapshotsDialogProps): React.ReactElement | null {
  if (!props.open) return null
  // Mounted only while open so the default name is stamped fresh each time.
  return <SnapshotsDialogBody {...props} />
}

function SnapshotsDialogBody({
  t,
  open,
  onClose,
  snapshots,
  onSave,
  onRestore,
  onDelete,
}: SnapshotsDialogProps): React.ReactElement {
  const [name, setName] = useState(
    () => `${t("snapshots.defaultName")} ${new Date().toLocaleString()}`,
  )
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const btn = "rounded border border-panel px-2 py-1 text-xs hover:bg-panel-hover"

  return (
    <Dialog t={t} open={open} onClose={onClose} title={t("snapshots.title")}>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSave(name.trim())
        }}
      >
        <input
          data-testid="snapshots-name"
          aria-label={t("snapshots.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-64 rounded border border-panel bg-transparent px-2 py-1 text-sm"
        />
        <button
          type="submit"
          data-testid="snapshots-save"
          className="rounded bg-accent px-3 py-1 text-sm text-white"
        >
          {t("snapshots.save")}
        </button>
      </form>
      {snapshots.length === 0 ? (
        <p className="text-sm text-muted">{t("snapshots.empty")}</p>
      ) : (
        <ul className="max-h-80 w-[28rem] max-w-full overflow-y-auto">
          {snapshots.map((s) => (
            <li
              key={s.id}
              data-testid="snapshot-row"
              className="border-b border-panel py-2 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{s.name}</div>
                  <div className="text-xs text-muted">{new Date(s.createdAt).toLocaleString()}</div>
                </div>
                <button
                  type="button"
                  data-testid="snapshot-restore"
                  onClick={() => setConfirmId(s.id)}
                  className={btn}
                >
                  {t("snapshots.restore")}
                </button>
                <button
                  type="button"
                  data-testid="snapshot-delete"
                  onClick={() => onDelete(s.id)}
                  className={`${btn} text-danger`}
                >
                  {t("snapshots.delete")}
                </button>
              </div>
              {confirmId === s.id && (
                <div role="alert" className="mt-2 flex items-center gap-2">
                  <p className="flex-1 text-xs">{t("snapshots.confirmRestore")}</p>
                  <button type="button" onClick={() => setConfirmId(null)} className={btn}>
                    {t("snapshots.cancel")}
                  </button>
                  <button
                    type="button"
                    data-testid="snapshot-restore-confirm"
                    onClick={() => {
                      setConfirmId(null)
                      onRestore(s.id)
                    }}
                    className="rounded bg-danger px-2 py-1 text-xs text-white"
                  >
                    {t("snapshots.confirm")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
