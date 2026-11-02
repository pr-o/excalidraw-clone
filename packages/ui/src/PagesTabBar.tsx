import { useRef, useState } from "react"
import { Icon } from "./shared/Icon"

// Small icon button inside a page tab (40px on touch).
const TAB_BTN =
  "flex h-6 w-6 pointer-coarse:h-10 pointer-coarse:w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-hover hover:text-app disabled:pointer-events-none disabled:opacity-30 [&_svg]:h-3.5 [&_svg]:w-3.5"

export interface PagesTabBarProps {
  t: (key: string) => string
  pages: readonly { id: string; name: string }[]
  activePageId: string
  thumbnails?: Readonly<Record<string, string | undefined>>
  onSwitch: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onReorder: (id: string, direction: "left" | "right") => void
  onMove: (id: string, toIndex: number) => void
  /** View mode: tabs only switch pages; add/rename/delete/reorder/duplicate are hidden. */
  readOnly?: boolean
  className?: string
}

interface DragState {
  draggedId: string
  overIndex: number | null
  dropLineLeft: number
}

export function PagesTabBar({
  t,
  pages,
  activePageId,
  thumbnails,
  onSwitch,
  onAdd,
  onDelete,
  onRename,
  onDuplicate,
  onReorder,
  onMove,
  readOnly = false,
  className,
}: PagesTabBarProps): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [drag, setDrag] = useState<DragState | null>(null)
  const barRef = useRef<HTMLElement>(null)

  const startRename = (id: string, currentName: string): void => {
    setEditingId(id)
    setDraftName(currentName)
  }

  const commitRename = (id: string): void => {
    if (draftName.trim().length > 0) onRename(id, draftName.trim())
    setEditingId(null)
  }

  const handleTabPointerDown =
    (id: string) =>
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const target = e.target as HTMLElement
      if (readOnly || target.closest("button, input")) return
      setDrag({ draggedId: id, overIndex: null, dropLineLeft: 0 })
    }

  const handleBarPointerMove = (e: React.PointerEvent<HTMLElement>): void => {
    if (!drag) return
    const bar = barRef.current
    if (!bar) return
    const tabEls = Array.from(bar.querySelectorAll<HTMLElement>("[data-page-tab-index]"))
    if (tabEls.length === 0) return
    let boundary = pages.length
    let dropLineLeft = tabEls[tabEls.length - 1]!.getBoundingClientRect().right
    for (const el of tabEls) {
      const rect = el.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      if (e.clientX < mid) {
        boundary = Number(el.dataset.pageTabIndex)
        dropLineLeft = rect.left
        break
      }
    }
    setDrag({ ...drag, overIndex: boundary, dropLineLeft })
  }

  const handleBarPointerUp = (): void => {
    if (!drag) return
    const { draggedId, overIndex } = drag
    if (overIndex !== null) {
      const fromIndex = pages.findIndex((p) => p.id === draggedId)
      const target = overIndex > fromIndex ? overIndex - 1 : overIndex
      if (fromIndex !== -1 && target !== fromIndex) onMove(draggedId, target)
    }
    setDrag(null)
  }

  return (
    <nav
      ref={barRef}
      aria-label={t("pages.title")}
      data-testid="pages-tab-bar"
      onPointerMove={handleBarPointerMove}
      onPointerUp={handleBarPointerUp}
      className={`fixed bottom-3 left-3 z-30 flex max-w-[calc(100vw-14rem)] max-[480px]:bottom-16 max-[480px]:max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-xl bg-panel p-1 shadow-panel ${className ?? ""}`}
    >
      {drag && drag.overIndex !== null && (
        <div
          data-testid="page-drop-line"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-accent"
          style={{ left: drag.dropLineLeft }}
        />
      )}

      {pages.map((page, index) => {
        const active = page.id === activePageId
        const editing = editingId === page.id
        const thumb = thumbnails?.[page.id]
        // On touch only the active tab carries its 40px controls, keeping tabs narrow.
        const tabBtn = active ? TAB_BTN : `${TAB_BTN} pointer-coarse:hidden`
        return (
          <div
            key={page.id}
            data-testid={`page-tab-${page.id}`}
            data-page-tab-index={index}
            onPointerDown={handleTabPointerDown(page.id)}
            className={`flex shrink-0 items-center gap-1 rounded-lg py-0.5 pl-1 pr-1.5 text-xs ${
              active ? "bg-accent-soft" : "hover:bg-panel-hover"
            }`}
          >
            {!readOnly && (
              <button
                type="button"
                data-testid={`page-reorder-left-${page.id}`}
                aria-label={t("pages.moveLeft")}
                title={t("pages.moveLeft")}
                disabled={index === 0}
                onClick={() => onReorder(page.id, "left")}
                className={tabBtn}
              >
                <Icon name="chevron-left" />
              </button>
            )}

            {thumb ? (
              <img
                src={thumb}
                alt=""
                data-testid={`page-thumb-${page.id}`}
                className="h-[33px] w-[46px] shrink-0 rounded-sm border border-panel-subtle object-contain"
              />
            ) : (
              <div
                data-testid={`page-thumb-${page.id}`}
                aria-hidden="true"
                className="h-[33px] w-[46px] shrink-0 rounded-sm border border-panel-subtle bg-panel-subtle"
              />
            )}

            {editing && !readOnly ? (
              <input
                autoFocus
                data-testid={`page-rename-input-${page.id}`}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => commitRename(page.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(page.id)
                  if (e.key === "Escape") setEditingId(null)
                }}
                className="w-24 rounded border border-panel bg-panel px-1"
              />
            ) : (
              <button
                type="button"
                data-testid={`page-switch-${page.id}`}
                onClick={() => onSwitch(page.id)}
                onDoubleClick={readOnly ? undefined : () => startRename(page.id, page.name)}
                className={`max-w-[8rem] truncate px-0.5 ${active ? "font-medium" : ""}`}
              >
                {page.name}
              </button>
            )}

            {!readOnly && (
              <>
                <button
                  type="button"
                  data-testid={`page-reorder-right-${page.id}`}
                  aria-label={t("pages.moveRight")}
                  title={t("pages.moveRight")}
                  disabled={index === pages.length - 1}
                  onClick={() => onReorder(page.id, "right")}
                  className={tabBtn}
                >
                  <Icon name="chevron-right" />
                </button>

                <button
                  type="button"
                  data-testid={`page-duplicate-${page.id}`}
                  aria-label={t("pages.duplicate")}
                  title={t("pages.duplicate")}
                  onClick={() => onDuplicate(page.id)}
                  className={tabBtn}
                >
                  <Icon name="duplicate" />
                </button>

                <button
                  type="button"
                  data-testid={`page-delete-${page.id}`}
                  aria-label={t("pages.delete")}
                  title={t("pages.delete")}
                  disabled={pages.length === 1}
                  onClick={() => onDelete(page.id)}
                  className={tabBtn}
                >
                  <Icon name="close" />
                </button>
              </>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <button
          type="button"
          data-testid="page-add"
          aria-label={t("pages.add")}
          title={t("pages.add")}
          onClick={onAdd}
          className="sticky right-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel hover:bg-panel-hover pointer-coarse:h-10 pointer-coarse:w-10"
        >
          <Icon name="plus" />
        </button>
      )}
    </nav>
  )
}
