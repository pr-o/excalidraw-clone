import { useEffect, useState } from "react"
import { Dialog } from "./shared/Dialog"

export interface ExportOptions {
  format: "png" | "svg"
  scale: 1 | 2 | 3
  background: "white" | "dark" | "transparent"
  embedScene: boolean
}

export interface ExportDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  onExport: (opts: ExportOptions) => void
  defaultBackground?: ExportOptions["background"]
  className?: string
}

const SCALES = [1, 2, 3] as const

export function ExportDialog({
  t,
  open,
  onClose,
  onExport,
  defaultBackground,
  className,
}: ExportDialogProps): React.ReactElement | null {
  const [format, setFormat] = useState<ExportOptions["format"]>("png")
  const [scale, setScale] = useState<ExportOptions["scale"]>(1)
  const [background, setBackground] = useState<ExportOptions["background"]>(
    defaultBackground ?? "white",
  )
  const [embedScene, setEmbedScene] = useState(false)

  useEffect(() => {
    if (open) setBackground(defaultBackground ?? "white")
  }, [open, defaultBackground])

  if (!open) return null

  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("export.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <div className="space-y-4">
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
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1 text-sm"
          >
            {t("export.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onExport({ format, scale, background, embedScene })}
            className="rounded bg-violet-600 px-3 py-1 text-sm text-white"
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
      <span className="text-sm font-medium text-gray-700">{label}</span>
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
          className={`rounded border px-2 py-1 text-xs ${value === opt.value ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
