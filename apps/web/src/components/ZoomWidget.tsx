"use client"
import { Icon } from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { zoomAboutCentre } from "../driver/zoom"
import { useAppStore } from "../store"

/** Bottom-right zoom out / reset (showing the current %) / in control. */
export function ZoomWidget(): React.ReactElement {
  const { t } = useTranslation()
  const zoom = useAppStore((s) => s.zoom)
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-panel p-1 text-xs shadow-panel">
      <button
        type="button"
        data-testid="zoom-out"
        aria-label={t("shortcuts:zoomOut")}
        title={t("shortcuts:zoomOut")}
        onClick={() => zoomAboutCentre((z) => z / 1.1)}
        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-panel-hover pointer-coarse:h-10 pointer-coarse:w-10"
      >
        <Icon name="minus" />
      </button>
      <button
        type="button"
        data-testid="zoom-reset"
        // The accessible name starts with the visible "100%" (WCAG 2.5.3 label in name),
        // so a voice-control user can say what they see.
        aria-label={`${Math.round(zoom * 100)}%, ${t("shortcuts:zoomReset")}`}
        onClick={() => zoomAboutCentre(() => 1)}
        title={t("shortcuts:zoomReset")}
        className="h-7 min-w-[3.5rem] rounded-lg px-1.5 text-center tabular-nums hover:bg-panel-hover"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        data-testid="zoom-in"
        aria-label={t("shortcuts:zoomIn")}
        title={t("shortcuts:zoomIn")}
        onClick={() => zoomAboutCentre((z) => z * 1.1)}
        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-panel-hover pointer-coarse:h-10 pointer-coarse:w-10"
      >
        <Icon name="plus" />
      </button>
    </div>
  )
}
