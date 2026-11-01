import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { Icon } from "./shared/Icon"
import { PanelHeader, PanelToggle } from "./shared/PanelToggle"

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
}

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
}: LayersPanelProps): React.ReactElement {
  const rows = elements
    .filter((e) => !e.isDeleted)
    .slice()
    .reverse()

  const orderButtons = [
    ["send-to-back", "sendToBack", "⏮", onSendToBack],
    ["send-backward", "sendBackward", "◀", onSendBackward],
    ["bring-forward", "bringForward", "▶", onBringForward],
    ["bring-to-front", "bringToFront", "⏭", onBringToFront],
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
      />
      <>
        <ul className="flex-1 overflow-y-auto px-2 py-2">
          {rows.map((element) => {
            const selected = selectedIds.includes(element.id)
            const label =
              element.type === "text"
                ? element.text.trim() || t("toolbar.text")
                : t(`toolbar.${element.type}`)
            return (
              <li
                key={element.id}
                data-testid={`layer-row-${element.id}`}
                className={`mb-0.5 flex items-center gap-1 rounded px-1 py-1 text-xs ${
                  selected ? "bg-accent-soft" : "hover:bg-panel-subtle"
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
                <div className="flex shrink-0 gap-0.5">
                  {orderButtons.map(([slug, key, glyph, run]) => (
                    <button
                      key={slug}
                      type="button"
                      data-testid={`layer-${slug}-${element.id}`}
                      aria-label={t(`properties.${key}`)}
                      title={t(`properties.${key}`)}
                      onClick={() => run(element.id)}
                      className="rounded px-0.5 text-[10px] text-muted hover:bg-panel-hover hover:text-app"
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </>
    </aside>
  )
}
