import { Dialog } from "./shared/Dialog"

const CANVAS_BG_COLORS = ["#ffffff", "#f8f9fa", "#fff5f5", "#f3f0ff", "#1e1e1e"] as const

export interface CanvasBgDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  value: string
  onChange: (color: string) => void
  className?: string
}

export function CanvasBgDialog({
  t,
  open,
  onClose,
  value,
  onChange,
  className,
}: CanvasBgDialogProps): React.ReactElement | null {
  if (!open) return null
  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("canvasBg.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <div className="flex flex-wrap gap-2">
        {CANVAS_BG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            data-testid={`canvas-bg-${c.replace("#", "")}`}
            aria-pressed={value === c}
            aria-label={c}
            onClick={() => {
              onChange(c)
              onClose()
            }}
            className={`h-10 w-10 rounded border-2 ${value === c ? "border-violet-600" : "border-gray-300"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </Dialog>
  )
}
