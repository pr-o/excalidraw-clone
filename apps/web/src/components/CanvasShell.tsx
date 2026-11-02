"use client"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useDrawingDriver } from "../driver/useDrawingDriver"
import { Rulers } from "./Rulers"

/** Return keyboard focus to the drawing canvas (after Escape in an editor). */
export function focusCanvas(): void {
  document.querySelector<HTMLCanvasElement>('[data-testid="drawing-canvas"]')?.focus()
}

export interface CanvasShellProps {
  scene: Scene
  onRendererReady?: (renderer: CanvasRenderer) => void
  onRendererTeardown?: () => void
}

export function CanvasShell({
  scene,
  onRendererReady,
  onRendererTeardown,
}: CanvasShellProps): React.ReactElement {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const laserRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    const laser = laserRef.current
    if (!wrapper || !canvas || !overlay || !laser) return

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      const w = wrapper.clientWidth
      const h = wrapper.clientHeight
      for (const c of [canvas, overlay, laser]) {
        c.width = Math.floor(w * dpr)
        c.height = Math.floor(h * dpr)
        c.style.width = `${w}px`
        c.style.height = `${h}px`
      }
      const ctx = canvas.getContext("2d")
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  useDrawingDriver({
    scene,
    canvasRef,
    overlayRef,
    laserRef,
    ...(onRendererReady ? { onReady: onRendererReady } : {}),
    ...(onRendererTeardown ? { onTeardown: onRendererTeardown } : {}),
  })

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        // Focusable so keyboard users can Tab into the drawing and walk its
        // elements (see onCanvasKeyDown in useDrawingDriver).
        tabIndex={0}
        role="application"
        aria-label={t("a11y.canvas")}
        aria-describedby="canvas-keyboard-hint"
        data-testid="drawing-canvas"
        // iOS: no callout / text-selection magnifier on long-press.
        className="absolute inset-0 touch-none select-none outline-none [-webkit-touch-callout:none] focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[var(--color-accent)]"
      />
      <p id="canvas-keyboard-hint" className="sr-only">
        {t("a11y.canvasHint")}
      </p>
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <canvas ref={laserRef} className="pointer-events-none absolute inset-0" />
      <Rulers scene={scene} />
    </div>
  )
}
