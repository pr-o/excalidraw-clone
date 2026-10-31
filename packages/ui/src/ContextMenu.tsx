"use client"
import { useMenuPopup } from "./shared/useMenuPopup"

export interface ContextMenuItem {
  id: string
  label: string
  hint?: string
  perform: () => void
}

export interface ContextMenuProps {
  x: number
  y: number
  items: readonly ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const { ref: menuRef, pos } = useMenuPopup(x, y, onClose)

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="context-menu"
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="z-50 min-w-[180px] rounded-lg bg-panel py-1 shadow-xl"
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          type="button"
          data-testid={`context-menu-item-${item.id}`}
          onClick={() => {
            item.perform()
            onClose()
          }}
          className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
        >
          <span>{item.label}</span>
          {item.hint && <kbd className="font-mono text-xs text-muted">{item.hint}</kbd>}
        </button>
      ))}
    </div>
  )
}
