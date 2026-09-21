import { useMemo } from "react"
import { describeHistoryChange, type ExcalidrawElement } from "@excalidraw-clone/scene"

export interface HistoryPanelProps {
  t: (key: string, options?: { count: number }) => string
  history: readonly (readonly ExcalidrawElement[])[]
  currentIndex: number
  open: boolean
  onToggle: () => void
  onJump: (index: number) => void
}

export function HistoryPanel({
  t,
  history,
  currentIndex,
  open,
  onToggle,
  onJump,
}: HistoryPanelProps): React.ReactElement {
  // Hooks must run unconditionally, so this sits above the closed-state early
  // return. Scene.pushHistory always reassigns `this.history` to a new array
  // (never mutates in place), so reference-keyed memoization is correct — and
  // it keeps per-frame `skipHistory` drag notifications from re-deriving every
  // label on every pointer-move.
  const entries = useMemo(
    () =>
      open
        ? history.map((snapshot, i) => {
            const description = describeHistoryChange(
              i === 0 ? undefined : history[i - 1],
              snapshot,
            )
            const label =
              description.category === "initial"
                ? t("history.initial")
                : t(`history.${description.category}`, { count: description.count })
            return { index: i, label }
          })
        : [],
    // `t` is intentionally omitted: it is a stable i18next binding here, and
    // including it would defeat the memo on every render.
    [open, history],
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={t("history.toggle")}
        aria-expanded={false}
        data-testid="history-toggle"
        className="fixed right-3 top-16 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-panel shadow hover:bg-panel-hover"
      >
        ‹
      </button>
    )
  }

  return (
    <aside
      aria-label={t("history.title")}
      data-testid="history-panel"
      className="fixed right-0 top-16 z-30 flex h-[calc(100%-5rem)] w-64 flex-col bg-panel shadow-lg"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={t("history.toggle")}
        aria-expanded={open}
        data-testid="history-toggle"
        className="flex h-10 w-10 items-center justify-center self-end border-b text-sm"
      >
        ›
      </button>

      <div className="border-b px-3 py-2 text-sm font-medium">{t("history.title")}</div>
      <ul className="flex-1 overflow-y-auto px-2 py-2">
        {entries
          .slice()
          .reverse()
          .map(({ index, label }) => {
            const current = index === currentIndex
            return (
              <li key={index} data-testid={`history-row-${index}`}>
                <button
                  type="button"
                  data-testid={`history-jump-${index}`}
                  onClick={() => onJump(index)}
                  className={`mb-0.5 w-full rounded px-2 py-1 text-left text-xs ${
                    current ? "bg-accent-soft" : "hover:bg-panel-subtle"
                  }`}
                >
                  {label}
                </button>
              </li>
            )
          })}
      </ul>
    </aside>
  )
}
