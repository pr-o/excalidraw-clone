"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

/** Fixed-position `role="menu"` popup at viewport point (x, y): flips to stay on
 *  screen, focuses the first menuitem, roves focus with Arrow/Home/End, and
 *  closes on Escape or a pointerdown outside. Attach `ref` to the menu element. */
export function useMenuPopup(
  x: number,
  y: number,
  onClose: () => void,
): {
  ref: React.RefObject<HTMLDivElement | null>
  pos: { left: number; top: number }
} {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = x + rect.width > window.innerWidth ? Math.max(0, x - rect.width) : x
    const top = y + rect.height > window.innerHeight ? Math.max(0, y - rect.height) : y
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [])

  useEffect(() => {
    const moveFocus = (next: (current: number, count: number) => number): void => {
      const buttons = Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
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
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [onClose])

  return { ref, pos }
}
