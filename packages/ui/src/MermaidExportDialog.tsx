import { useState } from "react"
import { Dialog } from "./shared/Dialog"
import { Button } from "./shared/Button"

export interface MermaidExportDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  text: string
  className?: string
}

export function MermaidExportDialog(props: MermaidExportDialogProps): React.ReactElement | null {
  // Mounting only while open resets the copy status each time the dialog opens.
  if (!props.open) return null
  return <MermaidExportBody {...props} />
}

function MermaidExportBody({
  t,
  open,
  onClose,
  text,
  className,
}: MermaidExportDialogProps): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle")
  const copy = (): void => {
    // Optional call: insecure contexts have no navigator.clipboard at all.
    ;(navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("no clipboard"))).then(
      () => setStatus("copied"),
      () => setStatus("error"),
    )
  }

  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("mermaid.exportTitle")}
      className={className}
    >
      <textarea
        data-testid="mermaid-output"
        aria-label={t("mermaid.exportTitle")}
        value={text}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        rows={10}
        spellCheck={false}
        className="mb-2 block w-[28rem] max-w-full rounded border border-panel bg-panel p-2 font-mono text-sm"
      />
      {status === "copied" && (
        <p role="status" className="mb-2 text-sm text-muted">
          {t("mermaid.copied")}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {t("mermaid.copyFailed")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button variant="primary" data-testid="mermaid-copy" onClick={copy}>
          {t("mermaid.copy")}
        </Button>
      </div>
    </Dialog>
  )
}
