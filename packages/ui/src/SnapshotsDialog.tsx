import { useState } from "react"
import { useFormStatus } from "react-dom"
import { Dialog } from "./shared/Dialog"
import { Button } from "./shared/Button"

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
  /** May be async: the Save button shows as busy until it settles. */
  onSave: (name: string) => void | Promise<void>
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
  const [defaultName] = useState(
    () => `${t("snapshots.defaultName")} ${new Date().toLocaleString()}`,
  )
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const btn = "rounded border border-panel px-2 py-1 text-xs hover:bg-panel-hover"

  return (
    <Dialog t={t} open={open} onClose={onClose} title={t("snapshots.title")}>
      {/* A form Action: React handles submission (no preventDefault) and keeps
          the form pending while an async onSave runs. */}
      <form
        className="mb-4 flex gap-2"
        action={async (data) => {
          const raw = data.get("name")
          const name = typeof raw === "string" ? raw.trim() : ""
          if (name) await onSave(name)
        }}
      >
        <input
          name="name"
          data-testid="snapshots-name"
          aria-label={t("snapshots.name")}
          defaultValue={defaultName}
          className="w-64 rounded border border-panel bg-transparent px-2 py-1 text-sm"
        />
        <SaveButton label={t("snapshots.save")} />
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

/** Reads its form's pending state, so a slow save cannot be submitted twice. */
function SaveButton({ label }: { label: string }): React.ReactElement {
  const { pending } = useFormStatus()
  return (
    <Button
      variant="primary"
      type="submit"
      data-testid="snapshots-save"
      disabled={pending}
      aria-busy={pending}
    >
      {label}
    </Button>
  )
}
