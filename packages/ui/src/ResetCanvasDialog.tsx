import { Dialog } from "./shared/Dialog"

export interface ResetCanvasDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  onConfirm: () => void
  className?: string
}

export function ResetCanvasDialog({
  t,
  open,
  onClose,
  onConfirm,
  className,
}: ResetCanvasDialogProps): React.ReactElement | null {
  if (!open) return null
  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("reset.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <p className="mb-4 text-sm text-muted">{t("reset.body")}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-panel px-3 py-1 text-sm"
        >
          {t("reset.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded bg-danger px-3 py-1 text-sm text-white"
        >
          {t("reset.confirm")}
        </button>
      </div>
    </Dialog>
  )
}
