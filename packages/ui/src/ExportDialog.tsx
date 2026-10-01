import { useEffect, useState } from "react"
import { Dialog } from "./shared/Dialog"

export interface ExportOptions {
  format: "png" | "svg"
  scale: 1 | 2 | 3
  background: "white" | "dark" | "transparent"
  embedScene: boolean
  /** "selection" exports only the current selection (active page only). */
  scope: "page" | "selection"
  /** The page whose elements are exported. */
  pageId: string
}

/** A page as listed in the export page picker. */
export interface ExportPageOption {
  id: string
  name: string
}

export interface ExportDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  onExport: (opts: ExportOptions) => void
  /** Copy a PNG of the current options to the clipboard. A rejection (or a
   *  synchronous throw) shows an inline error; the dialog stays open either
   *  way. Omit to hide the Copy button. */
  onCopy?: (opts: ExportOptions) => Promise<void>
  /** Every page, in tab order. The picker renders only when there are 2+. */
  pages: readonly ExportPageOption[]
  activePageId: string
  /** True when the active page has a non-empty selection. */
  hasSelection?: boolean
  defaultBackground?: ExportOptions["background"]
  className?: string
}

const SCALES = [1, 2, 3] as const

type CopyStatus = "idle" | "copying" | "copied" | "error"

export function ExportDialog({
  t,
  open,
  onClose,
  onExport,
  onCopy,
  pages,
  activePageId,
  hasSelection = false,
  defaultBackground,
  className,
}: ExportDialogProps): React.ReactElement | null {
  const [format, setFormat] = useState<ExportOptions["format"]>("png")
  const [scale, setScale] = useState<ExportOptions["scale"]>(1)
  const [background, setBackground] = useState<ExportOptions["background"]>(
    defaultBackground ?? "white",
  )
  const [embedScene, setEmbedScene] = useState(false)
  const [scope, setScope] = useState<ExportOptions["scope"]>("page")
  const [pageId, setPageId] = useState(activePageId)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle")

  // The component stays mounted while closed, so per-session choices are
  // reset every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setBackground(defaultBackground ?? "white")
    setScope("page")
    setPageId(activePageId)
    setCopyStatus("idle")
  }, [open, defaultBackground, activePageId])

  if (!open) return null

  // A picked page that no longer exists falls back to the active page.
  const targetPageId = pages.some((p) => p.id === pageId) ? pageId : activePageId
  // Selection is page-local: only offer it when exporting the active page.
  const showScope = hasSelection && targetPageId === activePageId
  const currentOptions = (): ExportOptions => ({
    format,
    scale,
    background,
    embedScene,
    scope: showScope ? scope : "page",
    pageId: targetPageId,
  })

  const handleCopy = (): void => {
    if (!onCopy) return
    setCopyStatus("copying")
    let pending: Promise<void> | undefined
    try {
      // Clipboard images are PNG-only, whatever the format toggle says.
      pending = onCopy({ ...currentOptions(), format: "png" })
    } catch {
      pending = undefined
    }
    if (pending === undefined) {
      setCopyStatus("error")
      return
    }
    void pending.then(
      () => setCopyStatus("copied"),
      () => setCopyStatus("error"),
    )
  }

  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("export.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <div className="space-y-4">
        {pages.length > 1 && (
          <Row label={t("export.page")}>
            <select
              data-testid="export-page"
              aria-label={t("export.page")}
              value={targetPageId}
              onChange={(e) => setPageId(e.target.value)}
              className="rounded border border-panel bg-panel px-2 py-1 text-xs"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
        )}
        {showScope && (
          <Row label={t("export.scope")}>
            <Toggle
              value={scope}
              setValue={setScope}
              options={[
                { value: "page", label: t("export.scopePage"), testId: "scope-page" },
                {
                  value: "selection",
                  label: t("export.scopeSelection"),
                  testId: "scope-selection",
                },
              ]}
            />
          </Row>
        )}
        <Row label={t("export.format")}>
          <Toggle
            value={format}
            setValue={setFormat}
            options={[
              { value: "png", label: "PNG", testId: "format-png" },
              { value: "svg", label: "SVG", testId: "format-svg" },
            ]}
          />
        </Row>
        <Row label={t("export.scale")}>
          <Toggle
            value={scale}
            setValue={setScale}
            options={SCALES.map((s) => ({ value: s, label: `${s}×`, testId: `scale-${s}` }))}
          />
        </Row>
        <Row label={t("export.background")}>
          <Toggle
            value={background}
            setValue={setBackground}
            options={[
              { value: "white", label: t("export.bgWhite"), testId: "bg-white" },
              { value: "dark", label: t("export.bgDark"), testId: "bg-dark" },
              { value: "transparent", label: t("export.bgTransparent"), testId: "bg-transparent" },
            ]}
          />
        </Row>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={embedScene}
            onChange={(e) => setEmbedScene(e.target.checked)}
          />
          {t("export.embed")}
        </label>
        {copyStatus === "error" && (
          <p role="alert" data-testid="export-copy-error" className="text-sm text-danger">
            {t("export.copyFailed")}
          </p>
        )}
        {copyStatus === "copied" && (
          <p role="status" data-testid="export-copy-success" className="text-sm text-muted">
            {t("export.copied")}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-panel px-3 py-1 text-sm"
          >
            {t("export.cancel")}
          </button>
          {onCopy && (
            <button
              type="button"
              data-testid="export-copy"
              onClick={handleCopy}
              disabled={copyStatus === "copying"}
              className="rounded border border-panel px-3 py-1 text-sm disabled:opacity-50"
            >
              {t("export.copy")}
            </button>
          )}
          <button
            type="button"
            onClick={() => onExport(currentOptions())}
            className="rounded bg-accent px-3 py-1 text-sm text-white"
          >
            {t("export.confirm")}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-muted">{label}</span>
      <div>{children}</div>
    </div>
  )
}

function Toggle<T extends string | number>({
  value,
  setValue,
  options,
}: {
  value: T
  setValue: (v: T) => void
  options: ReadonlyArray<{ value: T; label: string; testId: string }>
}): React.ReactElement {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          data-testid={opt.testId}
          aria-pressed={value === opt.value}
          onClick={() => setValue(opt.value)}
          className={`rounded border px-2 py-1 text-xs ${value === opt.value ? "border-accent bg-accent-soft" : "border-panel"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
