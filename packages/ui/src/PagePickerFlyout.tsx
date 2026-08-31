"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

export interface PagePickerPage {
  id: string
  name: string
}

export interface PagePickerFlyoutProps {
  x: number
  y: number
  pages: readonly PagePickerPage[]
  onSelect: (pageId: string) => void
  onClose: () => void
}

export function PagePickerFlyout({
  x,
  y,
  pages,
  onSelect,
  onClose,
}: PagePickerFlyoutProps): React.ReactElement {
  const flyoutRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = flyoutRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = x + rect.width > window.innerWidth ? Math.max(0, x - rect.width) : x
    const top = y + rect.height > window.innerHeight ? Math.max(0, y - rect.height) : y
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    flyoutRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [])

  useEffect(() => {
    const moveFocus = (next: (current: number, count: number) => number): void => {
      const buttons = Array.from(
        flyoutRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
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
      if (!flyoutRef.current?.contains(e.target as Node)) onClose()
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
      ref={flyoutRef}
      role="menu"
      data-testid="page-picker-flyout"
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="z-50 min-w-[180px] rounded-lg bg-panel py-1 shadow-xl"
    >
      {pages.map((page) => (
        <button
          key={page.id}
          role="menuitem"
          type="button"
          data-testid={`page-picker-item-${page.id}`}
          onClick={() => onSelect(page.id)}
          className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
        >
          <span>{page.name}</span>
        </button>
      ))}
    </div>
  )
}
