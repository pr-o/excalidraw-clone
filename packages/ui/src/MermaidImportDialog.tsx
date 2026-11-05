import { parseMermaidFlowchart, type MermaidFlowchart } from "@excalidraw-clone/scene"
import { useState } from "react"
import { Dialog } from "./shared/Dialog"
import { Button } from "./shared/Button"

export interface MermaidImportDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  onInsert: (chart: MermaidFlowchart) => void
  className?: string
}

const PLACEHOLDER = "graph TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]\n  B -->|no| A"

export function MermaidImportDialog(props: MermaidImportDialogProps): React.ReactElement | null {
  // Mounting only while open resets the textarea each time the dialog opens.
  if (!props.open) return null
  return <MermaidImportBody {...props} />
}

function MermaidImportBody({
  t,
  open,
  onClose,
  onInsert,
  className,
}: MermaidImportDialogProps): React.ReactElement {
  const [text, setText] = useState("")
  const parsed = text.trim() === "" ? null : parseMermaidFlowchart(text)
  const chart = parsed !== null && !("error" in parsed) ? parsed : null
  const warning =
    parsed === null
      ? null
      : "error" in parsed
        ? `${t("mermaid.error")}: ${parsed.error}`
        : parsed.skipped.length > 0
          ? `${t("mermaid.skipped")}: ${parsed.skipped.join(" · ")}`
          : null

  return (
    <Dialog t={t} open={open} onClose={onClose} title={t("mermaid.title")} className={className}>
      <textarea
        data-testid="mermaid-input"
        aria-label={t("mermaid.title")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={10}
        spellCheck={false}
        className="mb-2 block w-[28rem] max-w-full rounded border border-panel bg-panel p-2 font-mono text-sm"
      />
      {warning !== null && (
        <p data-testid="mermaid-warning" role="status" className="mb-2 text-sm text-danger">
          {warning}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("mermaid.cancel")}</Button>
        <Button
          variant="primary"
          data-testid="mermaid-insert"
          disabled={chart === null || chart.nodes.length === 0}
          onClick={() => chart && onInsert(chart)}
        >
          {t("mermaid.insert")}
        </Button>
      </div>
    </Dialog>
  )
}
