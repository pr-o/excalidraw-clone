"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

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
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = x + rect.width > window.innerWidth ? Math.max(0, x - rect.width) : x
    const top = y + rect.height > window.innerHeight ? Math.max(0, y - rect.height) : y
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="context-menu"
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="z-50 min-w-[180px] rounded-lg bg-white py-1 shadow-xl"
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
          className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-violet-100"
        >
          <span>{item.label}</span>
          {item.hint && <kbd className="font-mono text-xs text-gray-500">{item.hint}</kbd>}
        </button>
      ))}
    </div>
  )
}
