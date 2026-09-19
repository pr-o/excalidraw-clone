import type { ExcalidrawElement, Stats } from "@excalidraw-clone/scene"
import { useState } from "react"

export interface StatsPanelProps {
  t: (key: string) => string
  open: boolean
  stats: Stats
  onChange: (
    patch: Partial<Pick<ExcalidrawElement, "x" | "y" | "width" | "height" | "angle">>,
  ) => void
  className?: string
}

interface FieldProps {
  testId: string
  label: string
  value: number
  disabled: boolean
  onCommit: (n: number) => void
}

function Field({ testId, label, value, disabled, onCommit }: FieldProps): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? String(value)

  const commit = (): void => {
    // An empty or whitespace-only draft means "the user cleared the field",
    // not "set this to 0" — treat it like an untouched draft and revert.
    if (draft === null || draft.trim() === "") {
      setDraft(null)
      return
    }
    const n = Number(draft)
    if (Number.isFinite(n)) onCommit(n)
    setDraft(null)
  }

  return (
    <label className="flex items-center justify-between gap-1 py-0.5">
      <span className="text-muted">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        data-testid={testId}
        value={display}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur()
          } else if (e.key === "Escape") {
            setDraft(null)
          }
        }}
        className="w-16 rounded border border-panel px-1 text-right disabled:opacity-50"
      />
    </label>
  )
}

export function StatsPanel({
  t,
  open,
  stats,
  onChange,
  className,
}: StatsPanelProps): React.ReactElement | null {
  if (!open) return null

  const container = `fixed bottom-16 left-3 z-30 w-52 rounded-lg bg-panel p-3 text-xs shadow-lg ${className ?? ""}`

  if (stats.kind === "scene") {
    return (
      <aside aria-label={t("stats.title")} data-testid="stats-panel" className={container}>
        <div className="mb-2 font-medium">{t("stats.title")}</div>
        <div data-testid="stats-element-count">
          {t("stats.elements")}: {stats.elementCount}
        </div>
      </aside>
    )
  }

  const isSingle = stats.kind === "single"
  // `line`/`arrow`/`freedraw` derive their geometry entirely from `element.points`;
  // `width`/`height` are a derived bounding box that every other code path recomputes
  // from the points. Writing them here would be a silent no-op on canvas and would leave
  // the stored bounds stale, so those two fields stay read-only for these types.
  const isPointsDerived =
    stats.kind === "single" &&
    (stats.type === "line" || stats.type === "arrow" || stats.type === "freedraw")
  const sizeDisabled = !isSingle || isPointsDerived

  return (
    <aside aria-label={t("stats.title")} data-testid="stats-panel" className={container}>
      <div className="mb-2 font-medium">{t("stats.title")}</div>
      {stats.kind === "multi" && (
        <div data-testid="stats-multi-count" className="mb-2 text-muted">
          {t("stats.selected")}: {stats.count}
        </div>
      )}
      <div>
        <Field
          testId="stats-x"
          label={t("stats.x")}
          value={stats.x}
          disabled={!isSingle}
          onCommit={(n) => onChange({ x: n })}
        />
        <Field
          testId="stats-y"
          label={t("stats.y")}
          value={stats.y}
          disabled={!isSingle}
          onCommit={(n) => onChange({ y: n })}
        />
        <Field
          testId="stats-width"
          label={t("stats.width")}
          value={stats.width}
          disabled={sizeDisabled}
          onCommit={(n) => onChange({ width: Math.max(1, n) })}
        />
        <Field
          testId="stats-height"
          label={t("stats.height")}
          value={stats.height}
          disabled={sizeDisabled}
          onCommit={(n) => onChange({ height: Math.max(1, n) })}
        />
        {stats.kind === "single" && (
          <Field
            testId="stats-angle"
            label={t("stats.angle")}
            value={stats.angleDeg}
            disabled={false}
            onCommit={(n) => onChange({ angle: (n * Math.PI) / 180 })}
          />
        )}
      </div>
    </aside>
  )
}
