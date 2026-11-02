"use client"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

const DISMISSED_KEY = "excalidraw-empty-hint-dismissed"

// Per-viewer convenience: blocked storage just means the hint may show again next visit.
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

/** First-run nudge: shown on an empty page until this viewer's first element
 *  exists, then never again (not after a reset or on a new page). */
export function EmptyCanvasHint({
  hasElements,
  hidden,
}: {
  hasElements: boolean
  /** Temporarily hidden (dialog open, view mode) without dismissing it. */
  hidden: boolean
}): React.ReactElement | null {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(readDismissed)
  useEffect(() => {
    if (!hasElements || dismissed) return
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      // Not remembered; dismissed for this session only.
    }
  }, [hasElements, dismissed])

  if (dismissed || hasElements || hidden) return null
  return (
    <div
      data-testid="empty-canvas-hint"
      // Never intercepts drawing: the canvas underneath gets every pointer event.
      className="pointer-events-none absolute inset-x-4 top-[38%] z-10 flex select-none flex-col items-center gap-2 text-center text-muted"
    >
      <p className="canvas-handwritten text-3xl leading-tight">{t("canvas.emptyHint")}</p>
      <p className="text-sm">
        {t("canvas.emptyHintKeysBefore")}
        <kbd className="mx-1 rounded border border-panel bg-panel px-1.5 py-0.5 font-sans text-xs text-app">
          ?
        </kbd>
        {t("canvas.emptyHintKeysAfter")}
      </p>
    </div>
  )
}
