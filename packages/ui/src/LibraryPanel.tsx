import type { LibraryItem } from "@excalidraw-clone/scene"
import { useState } from "react"

export interface LibraryPanelProps {
  t: (key: string) => string
  open: boolean
  onToggle: () => void
  items: LibraryItem[]
  selectedCount: number
  onAddFromSelection: () => void
  onItemClick: (item: LibraryItem) => void
  onImport: () => void
  onExport: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  /** Returns inline SVG markup for a thumbnail. App wires this with the renderer. */
  renderThumbnail: (item: LibraryItem) => string
}

export function LibraryPanel(props: LibraryPanelProps): React.ReactElement {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const startRename = (item: LibraryItem): void => {
    setRenamingId(item.id)
    setDraftName(item.name)
    setMenuOpenId(null)
  }
  const commitRename = (id: string): void => {
    const trimmed = draftName.trim()
    if (trimmed !== "") props.onRename(id, trimmed)
    setRenamingId(null)
  }

  return (
    <aside
      aria-label={props.t("library.title")}
      data-testid="library-panel"
      className={`fixed right-0 top-16 z-30 flex h-[calc(100%-5rem)] flex-col bg-white shadow-lg transition-all ${
        props.open ? "w-72" : "w-10"
      }`}
    >
      <button
        type="button"
        onClick={props.onToggle}
        aria-label={props.t("library.toggle")}
        aria-expanded={props.open}
        data-testid="library-toggle"
        className="flex h-10 w-10 items-center justify-center self-end border-b text-sm"
      >
        {props.open ? "›" : "‹"}
      </button>

      {props.open && (
        <>
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">{props.t("library.title")}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={props.onImport}
                data-testid="library-import"
                className="rounded px-2 py-1 text-xs hover:bg-gray-100"
              >
                {props.t("library.import")}
              </button>
              <button
                type="button"
                onClick={props.onExport}
                data-testid="library-export"
                className="rounded px-2 py-1 text-xs hover:bg-gray-100"
              >
                {props.t("library.export")}
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={props.selectedCount === 0}
            onClick={props.onAddFromSelection}
            data-testid="library-add"
            className="m-3 rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            + {props.t("library.addFromSelection")}
          </button>

          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {props.items.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-gray-500">
                {props.t("library.empty")}
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {props.items.map((item) => (
                  <li key={item.id} data-testid={`library-item-${item.id}`} className="relative">
                    <button
                      type="button"
                      onClick={() => props.onItemClick(item)}
                      aria-label={item.name}
                      className="flex h-20 w-full items-center justify-center rounded border bg-gray-50 p-1 hover:border-violet-500"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderer-controlled SVG
                      dangerouslySetInnerHTML={{ __html: props.renderThumbnail(item) }}
                    />
                    {renamingId === item.id ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => commitRename(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(item.id)
                          if (e.key === "Escape") setRenamingId(null)
                        }}
                        className="mt-1 w-full rounded border px-1 text-xs"
                      />
                    ) : (
                      <button
                        type="button"
                        onDoubleClick={() => startRename(item)}
                        className="mt-1 block w-full truncate text-center text-xs"
                      >
                        {item.name}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                      aria-label="more"
                      className="absolute right-0 top-0 px-1 text-xs"
                    >
                      ⋯
                    </button>
                    {menuOpenId === item.id && (
                      <div
                        role="menu"
                        className="absolute right-0 top-5 z-10 rounded bg-white p-1 text-xs shadow"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => startRename(item)}
                          className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100"
                        >
                          {props.t("library.rename")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            props.onDelete(item.id)
                            setMenuOpenId(null)
                          }}
                          className="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50"
                        >
                          {props.t("library.delete")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
