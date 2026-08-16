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
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [])

  useEffect(() => {
    const moveFocus = (next: (current: number, count: number) => number): void => {
      const buttons = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      )
      if (buttons.length === 0) return
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[next(current, buttons.length)]?.focus()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        moveFocus((i, n) => (i + 1) % n)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        moveFocus((i, n) => (i <= 0 ? n - 1 : i - 1))
      } else if (e.key === "Home") {
        e.preventDefault()
        moveFocus(() => 0)
      } else if (e.key === "End") {
        e.preventDefault()
        moveFocus((_, n) => n - 1)
      }
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
