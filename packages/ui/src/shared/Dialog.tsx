import { Icon } from "./Icon"
import { useEffect, useRef } from "react"

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  t: (key: string) => string
  children: React.ReactNode
  className?: string | undefined
}

export function Dialog({
  open,
  onClose,
  title,
  t,
  children,
  className,
}: DialogProps): React.ReactElement {
  const ref = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    const handler = (): void => onClose()
    dlg.addEventListener("close", handler)
    return () => dlg.removeEventListener("close", handler)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      className={`m-auto rounded-xl bg-panel p-0 text-app shadow-panel backdrop:bg-black/40 ${className ?? ""}`}
      aria-labelledby="dialog-title"
    >
      <div className="flex items-center justify-between border-b border-panel-subtle px-4 py-3">
        <h2 id="dialog-title" className="text-base font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-panel-hover pointer-coarse:h-10 pointer-coarse:w-10"
          aria-label={t("common.close")}
          title={t("common.close")}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  )
}
