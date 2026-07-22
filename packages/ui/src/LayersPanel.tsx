import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { iconHTML } from "./shared/icons"

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

  return (
    <aside
      aria-label={t("layers.title")}
      data-testid="layers-panel"
      className={`fixed left-0 top-16 z-30 flex h-[calc(100%-5rem)] flex-col bg-white shadow-lg transition-all ${
        open ? "w-64" : "w-10"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={t("layers.toggle")}
        aria-expanded={open}
        data-testid="layers-toggle"
        className="flex h-10 w-10 items-center justify-center self-start border-b text-sm"
      >
        {open ? "‹" : "›"}
      </button>

      {open && (
        <>
          <div className="border-b px-3 py-2 text-sm font-medium">{t("layers.title")}</div>
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
                    selected ? "bg-violet-100" : "hover:bg-gray-50"
                  } ${element.groupIds.length > 0 ? "border-l-2 border-violet-300 pl-1" : ""}`}
                >
                  <button
                    type="button"
                    data-testid={`layer-select-${element.id}`}
                    onClick={(e) => onSelect(element.id, { additive: e.shiftKey })}
                    className="flex flex-1 items-center gap-1 overflow-hidden text-left"
                  >
                    <span
                      className="shrink-0"
                      aria-hidden
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: static icon set, no user input
                      dangerouslySetInnerHTML={{ __html: iconHTML(element.type) }}
                    />
                    {element.locked && (
                      <span aria-hidden className="shrink-0 text-[10px]">
                        🔒
                      </span>
                    )}
                    <span className="truncate">{label}</span>
                  </button>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      data-testid={`layer-send-to-back-${element.id}`}
                      aria-label={t("properties.sendToBack")}
                      title={t("properties.sendToBack")}
                      onClick={() => onSendToBack(element.id)}
                      className="rounded px-0.5 hover:bg-gray-100"
                    >
                      ⏮
                    </button>
                    <button
                      type="button"
                      data-testid={`layer-send-backward-${element.id}`}
                      aria-label={t("properties.sendBackward")}
                      title={t("properties.sendBackward")}
                      onClick={() => onSendBackward(element.id)}
                      className="rounded px-0.5 hover:bg-gray-100"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      data-testid={`layer-bring-forward-${element.id}`}
                      aria-label={t("properties.bringForward")}
                      title={t("properties.bringForward")}
                      onClick={() => onBringForward(element.id)}
                      className="rounded px-0.5 hover:bg-gray-100"
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      data-testid={`layer-bring-to-front-${element.id}`}
                      aria-label={t("properties.bringToFront")}
                      title={t("properties.bringToFront")}
                      onClick={() => onBringToFront(element.id)}
                      className="rounded px-0.5 hover:bg-gray-100"
                    >
                      ⏭
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </aside>
  )
}
