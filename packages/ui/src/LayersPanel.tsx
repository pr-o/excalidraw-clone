import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { useState } from "react"
import { Icon } from "./shared/Icon"
import { PanelHeader, type PanelSibling, PanelToggle } from "./shared/PanelToggle"

export interface LayersPanelProps {
  t: (key: string) => string
  elements: readonly ExcalidrawElement[]
  selectedIds: readonly string[]
  open: boolean
  onToggle: () => void
  onSelect: (id: string, opts: { additive: boolean }) => void
  onSendToBack: (id: string) => void
  onSendBackward: (id: string) => void
  onBringForward: (id: string) => void
  onBringToFront: (id: string) => void
  /** Same-edge panel that one click in the header swaps to. */
  sibling?: PanelSibling | undefined
}

/** Fixed row height (px) so long lists can be windowed. */
const ROW_H = 28
/** Lists up to this long render every row; longer ones render only the rows in
 *  view (plus overscan), so a 5000-element page doesn't mount 25k buttons. */
const WINDOW_ABOVE = 100
const OVERSCAN = 10

export function LayersPanel({
  t,
  elements,
  selectedIds,
  open,
  onToggle,
  onSelect,
  onSendToBack,
  onSendBackward,
  onBringForward,
  onBringToFront,
  sibling,
}: LayersPanelProps): React.ReactElement {
  const [scroll, setScroll] = useState({ top: 0, height: 0 })
  const rows = elements.filter((e) => !e.isDeleted).reverse()
  const selected = new Set(selectedIds)
  // shortcut: keyboard Tab only reaches rendered rows of a windowed list; scroll (or
  // arrow keys on the focused list) brings others in. Upgrade to roving focus if needed.
  const windowed = rows.length > WINDOW_ABOVE
  // jsdom/first paint report 0 height: assume a tall viewport rather than render nothing.
  const viewH = scroll.height || 1200
  const first = windowed ? Math.max(0, Math.floor(scroll.top / ROW_H) - OVERSCAN) : 0
  const last = windowed
    ? Math.min(rows.length, Math.ceil((scroll.top + viewH) / ROW_H) + OVERSCAN)
    : rows.length

  const orderButtons = [
    ["send-to-back", "sendToBack", "send-to-back", onSendToBack],
    ["send-backward", "sendBackward", "send-backward", onSendBackward],
    ["bring-forward", "bringForward", "bring-forward", onBringForward],
    ["bring-to-front", "bringToFront", "bring-to-front", onBringToFront],
  ] as const

  if (!open) {
    return (
      <PanelToggle
        label={t("layers.toggle")}
        testId="layers-toggle"
        position="left-3 top-16"
        icon="layers"
        onClick={onToggle}
      />
    )
  }

  return (
    <aside
      aria-label={t("layers.title")}
      data-testid="layers-panel"
      className="fixed left-3 top-16 z-30 flex h-[calc(100%-8.5rem)] w-64 flex-col overflow-hidden rounded-xl bg-panel shadow-panel"
    >
      <PanelHeader
        title={t("layers.title")}
        toggleLabel={t("layers.toggle")}
        testId="layers-toggle"
        side="left"
        onToggle={onToggle}
        icon="layers"
        sibling={sibling}
      />
      <>
        <ul
          className="flex-1 overflow-y-auto px-2 py-2"
          onScroll={(e) =>
            setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })
          }
        >
          {first > 0 && <li aria-hidden style={{ height: first * ROW_H }} />}
          {rows.slice(first, last).map((element) => {
            const isSelected = selected.has(element.id)
            const label =
              element.type === "text"
                ? element.text.trim() || t("toolbar.text")
                : t(`toolbar.${element.type}`)
            return (
              <li
                key={element.id}
                data-testid={`layer-row-${element.id}`}
                style={{ height: ROW_H }}
                className={`flex items-center gap-1 rounded px-1 text-xs ${
                  isSelected ? "bg-accent-soft" : "hover:bg-panel-subtle"
                } ${element.groupIds.length > 0 ? "border-l-2 border-accent pl-1" : ""}`}
              >
                <button
                  type="button"
                  data-testid={`layer-select-${element.id}`}
                  onClick={(e) => onSelect(element.id, { additive: e.shiftKey })}
                  className="flex flex-1 items-center gap-1 overflow-hidden text-left"
                >
                  <span className="shrink-0 text-muted">
                    <Icon name={element.type} />
                  </span>
                  {element.locked && (
                    <span className="shrink-0 text-muted [&_svg]:h-3 [&_svg]:w-3">
                      <Icon name="lock" />
                    </span>
                  )}
                  <span className="truncate">{label}</span>
                </button>
                <div className="flex shrink-0">
                  {orderButtons.map(([slug, key, icon, run]) => (
                    <button
                      key={slug}
                      type="button"
                      data-testid={`layer-${slug}-${element.id}`}
                      aria-label={t(`properties.${key}`)}
                      title={t(`properties.${key}`)}
                      onClick={() => run(element.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-app hover:bg-panel-active [&_svg]:h-3.5 [&_svg]:w-3.5"
                    >
                      <Icon name={icon} />
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
          {last < rows.length && (
            <li aria-hidden style={{ height: (rows.length - last) * ROW_H }} />
          )}
        </ul>
      </>
    </aside>
  )
}
