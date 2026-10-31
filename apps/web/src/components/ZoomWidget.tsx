"use client"
import { useTranslation } from "react-i18next"
import { zoomAboutCentre } from "../driver/zoom"
import { useAppStore } from "../store"

/** Bottom-right zoom out / reset (showing the current %) / in control. */
export function ZoomWidget(): React.ReactElement {
  const { t } = useTranslation()
  const zoom = useAppStore((s) => s.zoom)
  return (
    <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs shadow">
      <button
        type="button"
        data-testid="zoom-out"
        aria-label={t("shortcuts:zoomOut")}
        onClick={() => zoomAboutCentre((z) => z / 1.1)}
        className="rounded px-1.5 py-0.5 hover:bg-gray-100"
      >
        −
      </button>
      <button
        type="button"
        data-testid="zoom-reset"
        aria-label={t("shortcuts:zoomReset")}
        onClick={() => zoomAboutCentre(() => 1)}
        className="min-w-[3.5rem] rounded px-1.5 py-0.5 text-center hover:bg-gray-100"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        data-testid="zoom-in"
        aria-label={t("shortcuts:zoomIn")}
        onClick={() => zoomAboutCentre((z) => z * 1.1)}
        className="rounded px-1.5 py-0.5 hover:bg-gray-100"
      >
        +
      </button>
    </div>
  )
}
