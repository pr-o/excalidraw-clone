import type { Comment } from "@excalidraw-clone/scene"
import { useState } from "react"

type Filter = "all" | "open" | "resolved"

export interface CommentsPanelProps {
  t: (key: string) => string
  /** The active page's comments; a pin's number is its 1-based position here. */
  comments: readonly Comment[]
  activeId: string | null
  readOnly: boolean
  onSelect: (id: string) => void
  onToggleResolved: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const FILTERS: readonly Filter[] = ["all", "open", "resolved"]
const LABEL: Record<Filter, string> = {
  all: "comments.filterAll",
  open: "comments.filterOpen",
  resolved: "comments.filterResolved",
}

export function CommentsPanel({
  t,
  comments,
  activeId,
  readOnly,
  onSelect,
  onToggleResolved,
  onDelete,
  onClose,
}: CommentsPanelProps): React.ReactElement {
  const [filter, setFilter] = useState<Filter>("all")
  const rows = comments
    .map((c, i) => ({ c, n: i + 1 }))
    .filter(({ c }) => filter === "all" || c.resolved === (filter === "resolved"))

  return (
    <aside
      aria-label={t("comments.title")}
      data-testid="comments-panel"
      className="fixed left-0 top-16 z-40 flex h-[calc(100%-5rem)] w-72 flex-col bg-panel shadow-lg"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">{t("comments.title")}</span>
        <button
          type="button"
          data-testid="comments-panel-close"
          aria-label={t("comments.close")}
          onClick={onClose}
          className="rounded px-1 text-sm hover:bg-panel-hover"
        >
          ✕
        </button>
      </div>
      <div role="group" className="flex gap-1 border-b px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            data-testid={`comments-filter-${f}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded border px-2 py-0.5 text-xs ${filter === f ? "border-accent bg-accent-soft" : "border-panel"}`}
          >
            {t(LABEL[f])}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted">{t("comments.empty")}</p>
      ) : (
        <ul className="flex-1 overflow-y-auto px-2 py-2">
          {rows.map(({ c, n }) => (
            <li
              key={c.id}
              data-testid={`comments-row-${c.id}`}
              className={`mb-1 rounded px-2 py-1 ${c.id === activeId ? "bg-accent-soft" : "hover:bg-panel-subtle"} ${c.resolved ? "opacity-60" : ""}`}
            >
              <button
                type="button"
                data-testid={`comments-row-open-${c.id}`}
                onClick={() => onSelect(c.id)}
                className="block w-full text-left text-sm"
              >
                <span className="mr-1 text-xs text-muted">#{n}</span>
                <span className="break-words">{c.text}</span>
                {c.replies.length > 0 && (
                  <span className="ml-1 text-xs text-muted">💬 {c.replies.length}</span>
                )}
              </button>
              {!readOnly && (
                <div className="mt-0.5 flex justify-end gap-1">
                  <button
                    type="button"
                    data-testid={`comments-row-resolve-${c.id}`}
                    onClick={() => onToggleResolved(c.id)}
                    className="rounded px-1.5 text-xs hover:bg-panel-hover"
                  >
                    {c.resolved ? t("comments.reopen") : t("comments.resolve")}
                  </button>
                  <button
                    type="button"
                    data-testid={`comments-row-delete-${c.id}`}
                    onClick={() => onDelete(c.id)}
                    className="rounded px-1.5 text-xs text-danger hover:bg-panel-hover"
                  >
                    {t("comments.delete")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
