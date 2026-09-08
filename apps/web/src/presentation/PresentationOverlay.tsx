"use client"
import React, { useEffect, useRef, useState } from "react"

/** Milliseconds of pointer/keyboard inactivity before the chrome fades out. */
const IDLE_FADE_MS = 3000

export interface PresentationOverlayProps {
  /** 0-based index of the slide currently on screen. */
  index: number
  /** Total number of slides. */
  count: number
  onPrev: () => void
  onNext: () => void
  laserActive: boolean
  onToggleLaser: () => void
  t: (key: string) => string
}

/**
 * Bottom-centered presentation chrome: prev / counter / next plus a laser toggle.
 *
 * Purely presentational — every piece of state except the idle-fade flag comes
 * from props. It stays mounted (and therefore in the accessibility tree) when
 * idle; only its opacity and pointer-events change.
 */
export function PresentationOverlay({
  index,
  count,
  onPrev,
  onNext,
  laserActive,
  onToggleLaser,
  t,
}: PresentationOverlayProps): React.ReactElement {
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clear = (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    const schedule = (): void => {
      clear()
      timerRef.current = setTimeout(() => setVisible(false), IDLE_FADE_MS)
    }
    const wake = (): void => {
      setVisible(true)
      schedule()
    }

    schedule()
    window.addEventListener("mousemove", wake)
    window.addEventListener("keydown", wake)
    return () => {
      clear()
      window.removeEventListener("mousemove", wake)
      window.removeEventListener("keydown", wake)
    }
  }, [])

  const navButtonClass =
    "rounded px-2 py-0.5 text-lg leading-none hover:bg-panel-hover disabled:pointer-events-none disabled:opacity-40"

  return (
    <div
      data-testid="presentation-overlay"
      className={`fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-lg border border-panel bg-panel px-2 py-1 text-app shadow-lg transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <button
        type="button"
        data-testid="presentation-prev"
        aria-label={t("presentation.prev")}
        title={t("presentation.prev")}
        disabled={index === 0}
        onClick={onPrev}
        className={navButtonClass}
      >
        ‹
      </button>

      <span
        data-testid="presentation-counter"
        className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted"
      >
        {`${index + 1} / ${count}`}
      </span>

      <button
        type="button"
        data-testid="presentation-next"
        aria-label={t("presentation.next")}
        title={t("presentation.next")}
        disabled={index >= count - 1}
        onClick={onNext}
        className={navButtonClass}
      >
        ›
      </button>

      <span aria-hidden="true" className="mx-1 h-4 w-px bg-panel-subtle" />

      <button
        type="button"
        data-testid="presentation-laser"
        aria-label={t("presentation.laser")}
        title={t("presentation.laser")}
        aria-pressed={laserActive}
        onClick={onToggleLaser}
        className={`rounded px-2 py-0.5 text-sm leading-none hover:bg-panel-hover ${
          laserActive ? "bg-accent-soft" : ""
        }`}
      >
        ✦
      </button>
    </div>
  )
}
