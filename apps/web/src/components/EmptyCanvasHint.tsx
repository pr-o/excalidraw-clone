"use client"
import { useTranslation } from "react-i18next"

/** First-run nudge on an empty page; gone as soon as the page has an element. */
export function EmptyCanvasHint(): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div
      data-testid="empty-canvas-hint"
      // Never intercepts drawing: the canvas underneath gets every pointer event.
      className="pointer-events-none absolute inset-x-4 top-[38%] z-10 flex select-none flex-col items-center gap-2 text-center text-muted"
    >
      <p className="text-lg font-medium">{t("canvas.emptyHint")}</p>
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
