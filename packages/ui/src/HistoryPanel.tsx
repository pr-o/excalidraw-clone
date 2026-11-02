import { useMemo } from "react"
import { describeHistoryChange, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { PanelHeader, type PanelSibling, PanelToggle } from "./shared/PanelToggle"

export interface HistoryPanelProps {
  t: (key: string, options?: { count: number }) => string
  history: readonly (readonly ExcalidrawElement[])[]
  currentIndex: number
  open: boolean
  onToggle: () => void
  onJump: (index: number) => void
  /** Same-edge panel that one click in the header swaps to. */
  sibling?: PanelSibling | undefined
}

export function HistoryPanel({
  t,
  history,
  currentIndex,
  open,
  onToggle,
  onJump,
  sibling,
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
      <PanelToggle
        label={t("history.toggle")}
        testId="history-toggle"
        position="right-3 top-16"
        icon="history"
        onClick={onToggle}
      />
    )
  }

  return (
    <aside
      aria-label={t("history.title")}
      data-testid="history-panel"
      className="fixed right-3 top-16 z-30 flex h-[calc(100%-8.5rem)] w-64 flex-col overflow-hidden rounded-xl bg-panel shadow-panel"
    >
      <PanelHeader
        title={t("history.title")}
        toggleLabel={t("history.toggle")}
        testId="history-toggle"
        side="right"
        onToggle={onToggle}
        icon="history"
        sibling={sibling}
      />
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
