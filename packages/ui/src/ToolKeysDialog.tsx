import { useState } from "react"
import { Dialog } from "./shared/Dialog"

export interface ToolKeysRow {
  tool: string
  key: string
  isDefault: boolean
}

export interface ToolKeysDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  rows: readonly ToolKeysRow[]
  /** Applies the binding and returns null, or returns an i18n error key and changes nothing. */
  onRebind: (tool: string, key: string, withModifier: boolean) => string | null
  onReset: (tool: string) => void
  onResetAll: () => void
  className?: string
}

export function ToolKeysDialog(props: ToolKeysDialogProps): React.ReactElement | null {
  // Mounting only while open clears capture/error state each time the dialog opens.
  if (!props.open) return null
  return <ToolKeysBody {...props} />
}

const KBD = "rounded border border-panel bg-panel-subtle px-1.5 py-0.5 font-mono text-xs"
const BTN = "rounded border border-panel px-2 py-0.5 text-xs disabled:opacity-50"

function ToolKeysBody({
  t,
  open,
  onClose,
  rows,
  onRebind,
  onReset,
  onResetAll,
  className,
}: ToolKeysDialogProps): React.ReactElement {
  const [capturing, setCapturing] = useState<string | null>(null)
  const [error, setError] = useState<{ tool: string; message: string } | null>(null)

  const onCaptureKey = (tool: string, e: React.KeyboardEvent): void => {
    if (capturing !== tool || e.key === "Tab") return
    // Keep the editor's global shortcuts (tool switch, '?' help) from seeing the captured key.
    e.preventDefault()
    e.stopPropagation()
    if (e.key === "Escape") {
      setCapturing(null)
      return
    }
    // A lone modifier press is the start of a chord, not an answer yet.
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return
    const err = onRebind(tool, e.key, e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
    setError(err === null ? null : { tool, message: t(err) })
    if (err === null) setCapturing(null)
  }

  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("toolKeys.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <p className="mb-2 text-sm text-muted">{t("toolKeys.hint")}</p>
      <ul className="mb-3 max-h-[60vh] w-[22rem] max-w-full space-y-1 overflow-y-auto text-sm">
        {rows.map((r) => (
          <li key={r.tool} data-testid={`tool-key-row-${r.tool}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t(`shortcuts:${r.tool}`)}</span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`tool-key-${r.tool}`}
                  aria-label={`${t(`shortcuts:${r.tool}`)}: ${r.key.toUpperCase()}`}
                  aria-pressed={capturing === r.tool}
                  onClick={() => {
                    setCapturing(capturing === r.tool ? null : r.tool)
                    setError(null)
                  }}
                  onKeyDown={(e) => onCaptureKey(r.tool, e)}
                  onBlur={() => capturing === r.tool && setCapturing(null)}
                  className={capturing === r.tool ? `${KBD} border-accent` : KBD}
                >
                  {capturing === r.tool ? t("toolKeys.press") : r.key.toUpperCase()}
                </button>
                <button
                  type="button"
                  data-testid={`tool-key-reset-${r.tool}`}
                  disabled={r.isDefault}
                  onClick={() => {
                    onReset(r.tool)
                    setError(null)
                  }}
                  className={BTN}
                >
                  {t("toolKeys.reset")}
                </button>
              </span>
            </div>
            {error?.tool === r.tool && (
              <p role="alert" className="mt-0.5 text-xs text-danger">
                {error.message}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          data-testid="tool-keys-reset-all"
          disabled={rows.every((r) => r.isDefault)}
          onClick={() => {
            onResetAll()
            setError(null)
          }}
          className="rounded border border-panel px-3 py-1 text-sm disabled:opacity-50"
        >
          {t("toolKeys.resetAll")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-accent px-3 py-1 text-sm text-white"
        >
          {t("common.close")}
        </button>
      </div>
    </Dialog>
  )
}
