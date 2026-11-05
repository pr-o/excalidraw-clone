import type { LibraryItem } from "@excalidraw-clone/scene"
import { useState } from "react"
import { PanelHeader, type PanelSibling, PanelToggle } from "./shared/PanelToggle"
import { RenameInput } from "./shared/RenameInput"

export interface LibraryPanelProps {
  t: (key: string) => string
  open: boolean
  onToggle: () => void
  items: LibraryItem[]
  templates: LibraryItem[]
  selectedCount: number
  onAddFromSelection: () => void
  onItemClick: (item: LibraryItem) => void
  onImport: () => void
  onExport: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  /** Returns inline SVG markup for a thumbnail. App wires this with the renderer. */
  renderThumbnail: (item: LibraryItem) => string
  /** Same-edge panel that one click in the header swaps to. */
  sibling?: PanelSibling | undefined
}

interface ItemTileProps {
  item: LibraryItem
  testId: string
  readOnly: boolean
  renderThumbnail: (item: LibraryItem) => string
  onItemClick: (item: LibraryItem) => void
  renaming: boolean
  startRename: (item: LibraryItem) => void
  onRename: (id: string, name: string) => void
  endRename: () => void
  menuOpenId: string | null
  setMenuOpenId: (id: string | null) => void
  onDelete: (id: string) => void
  t: (key: string) => string
}

const svgDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

function ItemTile(props: ItemTileProps): React.ReactElement {
  const { item } = props
  return (
    <li data-testid={props.testId} className="relative">
      <button
        type="button"
        onClick={() => props.onItemClick(item)}
        aria-label={item.name}
        className="flex h-20 w-full items-center justify-center overflow-hidden rounded border bg-panel-subtle p-1 hover:border-accent"
      >
        {/* An image, not inline SVG: the thumbnail is decoration, and its text (a
            template's labels) must not become part of the tile's accessible name
            (WCAG 2.5.3). It also keeps rendered markup out of the page DOM. */}
        <img
          alt=""
          draggable={false}
          src={svgDataUrl(props.renderThumbnail(item))}
          className="h-full w-full object-contain"
        />
      </button>
      {!props.readOnly && props.renaming ? (
        <RenameInput
          initial={item.name}
          label={props.t("library.rename")}
          onRename={(name) => props.onRename(item.id, name)}
          onDone={props.endRename}
          className="mt-1 w-full rounded border px-1 text-xs"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => !props.readOnly && props.startRename(item)}
          className="mt-1 block w-full truncate text-center text-xs"
        >
          {item.name}
        </button>
      )}
      {!props.readOnly && (
        <>
          <button
            type="button"
            onClick={() => props.setMenuOpenId(props.menuOpenId === item.id ? null : item.id)}
            aria-label="more"
            className="absolute right-0 top-0 px-1 text-xs"
          >
            ⋯
          </button>
          {props.menuOpenId === item.id && (
            <div
              role="menu"
              className="absolute right-0 top-5 z-10 rounded bg-panel p-1 text-xs shadow-panel"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => props.startRename(item)}
                className="block w-full rounded px-2 py-1 text-left hover:bg-panel-hover"
              >
                {props.t("library.rename")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  props.onDelete(item.id)
                  props.setMenuOpenId(null)
                }}
                className="block w-full rounded px-2 py-1 text-left text-danger hover:bg-danger-soft"
              >
                {props.t("library.delete")}
              </button>
            </div>
          )}
        </>
      )}
    </li>
  )
}

export function LibraryPanel(props: LibraryPanelProps): React.ReactElement {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const startRename = (item: LibraryItem): void => {
    setRenamingId(item.id)
    setMenuOpenId(null)
  }

  const tileCommon = {
    renderThumbnail: props.renderThumbnail,
    onItemClick: props.onItemClick,
    startRename,
    onRename: props.onRename,
    endRename: () => setRenamingId(null),
    menuOpenId,
    setMenuOpenId,
    onDelete: props.onDelete,
    t: props.t,
  }

  if (!props.open) {
    return (
      <PanelToggle
        label={props.t("library.toggle")}
        testId="library-toggle"
        position="right-3 top-[6.5rem]"
        icon="library"
        onClick={props.onToggle}
      />
    )
  }

  return (
    <aside
      aria-label={props.t("library.title")}
      data-testid="library-panel"
      className="fixed right-3 top-16 z-30 flex h-[calc(100%-8.5rem)] w-72 flex-col overflow-hidden rounded-xl bg-panel shadow-panel"
    >
      <PanelHeader
        title={props.t("library.title")}
        toggleLabel={props.t("library.toggle")}
        testId="library-toggle"
        side="right"
        onToggle={props.onToggle}
        icon="library"
        sibling={props.sibling}
      >
        <button
          type="button"
          onClick={props.onImport}
          data-testid="library-import"
          className="rounded-lg px-2 py-1 text-xs hover:bg-panel-hover"
        >
          {props.t("library.import")}
        </button>
        <button
          type="button"
          onClick={props.onExport}
          data-testid="library-export"
          className="rounded-lg px-2 py-1 text-xs hover:bg-panel-hover"
        >
          {props.t("library.export")}
        </button>
      </PanelHeader>

      <>
        <button
          type="button"
          disabled={props.selectedCount === 0}
          onClick={props.onAddFromSelection}
          data-testid="library-add"
          className="m-3 rounded-lg border border-panel px-3 py-2 text-sm hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          + {props.t("library.addFromSelection")}
        </button>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {props.templates.length > 0 && (
            <>
              <p className="px-1 pb-1 pt-2 text-xs font-medium uppercase text-muted">
                {props.t("library.templates")}
              </p>
              <ul className="grid grid-cols-3 gap-2">
                {props.templates.map((item) => (
                  <ItemTile
                    key={item.id}
                    item={item}
                    testId={`template-item-${item.id}`}
                    readOnly
                    renaming={false}
                    {...tileCommon}
                  />
                ))}
              </ul>
            </>
          )}

          <p className="px-1 pb-1 pt-3 text-xs font-medium uppercase text-muted">
            {props.t("library.myItems")}
          </p>
          {props.items.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted">
              <p>{props.t("library.empty")}</p>
              <p className="mt-1 text-xs" data-testid="library-empty-hint">
                {props.t("library.emptyHint")}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {props.items.map((item) => (
                <ItemTile
                  key={item.id}
                  item={item}
                  testId={`library-item-${item.id}`}
                  readOnly={false}
                  renaming={renamingId === item.id}
                  {...tileCommon}
                />
              ))}
            </ul>
          )}
        </div>
      </>
    </aside>
  )
}
