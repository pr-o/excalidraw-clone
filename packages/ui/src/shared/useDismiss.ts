import { useEffect } from "react"

/**
 * While `open`, closes a popup the usual ways: Escape anywhere, or (with `containerRef`)
 * a press outside the container. The container should hold the popup *and* its
 * trigger, so pressing the trigger toggles instead of closing and reopening.
 */
export function useDismiss(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  containerRef?: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onOpenChange(false)
    }
    // Capture phase: the canvas stops propagation of its own pointer events.
    const onPointerDown = (e: PointerEvent): void => {
      const container = containerRef?.current
      if (container && !container.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [open, onOpenChange, containerRef])
}
