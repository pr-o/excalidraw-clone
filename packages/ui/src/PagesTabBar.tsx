import { useState } from "react"

export interface PagesTabBarProps {
  t: (key: string) => string
  pages: readonly { id: string; name: string }[]
  activePageId: string
  onSwitch: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onReorder: (id: string, direction: "left" | "right") => void
  className?: string
}

export function PagesTabBar({
  t,
  pages,
  activePageId,
  onSwitch,
  onAdd,
  onDelete,
  onRename,
  onDuplicate,
  onReorder,
  className,
}: PagesTabBarProps): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")

  const startRename = (id: string, currentName: string): void => {
    setEditingId(id)
    setDraftName(currentName)
  }

  const commitRename = (id: string): void => {
    if (draftName.trim().length > 0) onRename(id, draftName.trim())
    setEditingId(null)
  }

  return (
    <nav
      aria-label={t("pages.title")}
      data-testid="pages-tab-bar"
      className={`fixed bottom-0 left-0 right-0 z-30 flex items-center gap-1 overflow-x-auto bg-white px-2 py-1 shadow-lg ${className ?? ""}`}
    >
      {pages.map((page, index) => {
        const active = page.id === activePageId
        const editing = editingId === page.id
        return (
          <div
            key={page.id}
            data-testid={`page-tab-${page.id}`}
            className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs ${
              active ? "bg-violet-100" : "hover:bg-gray-50"
            }`}
          >
            <button
              type="button"
              data-testid={`page-reorder-left-${page.id}`}
              aria-label={t("pages.moveLeft")}
              disabled={index === 0}
              onClick={() => onReorder(page.id, "left")}
              className="rounded px-0.5 disabled:opacity-30"
            >
              ◀
            </button>

            {editing ? (
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
                className="w-24 rounded border border-gray-300 px-1"
              />
            ) : (
              <button
                type="button"
                data-testid={`page-switch-${page.id}`}
                onClick={() => onSwitch(page.id)}
                onDoubleClick={() => startRename(page.id, page.name)}
                className="max-w-[8rem] truncate"
              >
                {page.name}
              </button>
            )}

            <button
              type="button"
              data-testid={`page-reorder-right-${page.id}`}
              aria-label={t("pages.moveRight")}
              disabled={index === pages.length - 1}
              onClick={() => onReorder(page.id, "right")}
              className="rounded px-0.5 disabled:opacity-30"
            >
              ▶
            </button>

            <button
              type="button"
              data-testid={`page-duplicate-${page.id}`}
              aria-label={t("pages.duplicate")}
              title={t("pages.duplicate")}
              onClick={() => onDuplicate(page.id)}
              className="rounded px-0.5 hover:bg-gray-100"
            >
              ⧉
            </button>

            <button
              type="button"
              data-testid={`page-delete-${page.id}`}
              aria-label={t("pages.delete")}
              title={t("pages.delete")}
              disabled={pages.length === 1}
              onClick={() => onDelete(page.id)}
              className="rounded px-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        )
      })}

      <button
        type="button"
        data-testid="page-add"
        aria-label={t("pages.add")}
        title={t("pages.add")}
        onClick={onAdd}
        className="shrink-0 rounded px-2 py-1 text-xs hover:bg-gray-100"
      >
        +
      </button>
    </nav>
  )
}
