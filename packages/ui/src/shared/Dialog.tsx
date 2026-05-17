import { useEffect, useRef } from "react"

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  t: (key: string) => string
  children: React.ReactNode
  className?: string
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
      className={`rounded-lg p-0 backdrop:bg-black/40 ${className ?? ""}`}
      aria-labelledby="dialog-title"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-xl leading-none hover:bg-gray-100"
          aria-label={t("common.close")}
        >
          ×
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  )
}
