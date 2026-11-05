import { Dialog } from "./shared/Dialog"
import { Button } from "./shared/Button"

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
    <Dialog t={t} open={open} onClose={onClose} title={t("reset.title")} className={className}>
      <p className="mb-4 text-sm text-muted">{t("reset.body")}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("reset.cancel")}</Button>
        <Button variant="danger" onClick={onConfirm}>
          {t("reset.confirm")}
        </Button>
      </div>
    </Dialog>
  )
}
