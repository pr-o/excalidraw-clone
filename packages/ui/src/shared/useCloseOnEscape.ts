import { useEffect } from "react"

/** While `open`, Escape anywhere in the document calls `onOpenChange(false)`. */
export function useCloseOnEscape(open: boolean, onOpenChange: (open: boolean) => void): void {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])
}
