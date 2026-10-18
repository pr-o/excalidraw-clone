"use client"
import {
  centerViewOn,
  minimapFit,
  minimapToScene,
  sceneToMinimap,
  viewportSceneRect,
  type MinimapFit,
} from "@excalidraw-clone/geometry"
import { resolveColor } from "@excalidraw-clone/renderer"
import { getElementBounds, getElementsBounds, type Scene } from "@excalidraw-clone/scene"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSceneRevision } from "../hooks/useSceneRevision"
import { useAppStore } from "../store"

export const MINIMAP_W = 200
export const MINIMAP_H = 140
const PADDING = 8

const COLORS = {
  light: { image: "#adb5bd", frame: "#868e96" },
  dark: { image: "#5c5f66", frame: "#a3a3a3" },
} as const

/** Whole-page navigation panel: cheap bounds-rect drawing (no rough.js), a
 *  highlighted viewport rect, click/drag to centre the main view. */
export function Minimap({
  scene,
  className = "right-3",
}: {
  scene: Scene
  className?: string
}): React.ReactElement | null {
  const { t } = useTranslation()
  const visible = useAppStore((s) => s.minimapVisible && !s.presenting && !s.zenMode)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  const theme = useAppStore((s) => s.resolvedTheme)
  const revision = useSceneRevision(scene)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Fit includes the viewport, so panning could move the mapping under a drag; freeze it.
  const [frozen, setFrozen] = useState<MinimapFit | null>(null)
  const dragging = useRef(false)

  const vw = typeof window === "undefined" ? 0 : window.innerWidth
  const vh = typeof window === "undefined" ? 0 : window.innerHeight
  const view = { scrollX, scrollY, zoom }
  const vrect = viewportSceneRect(view, vw, vh)
  // revision stands in for scene content (the Scene object is referentially stable).
  const live = useMemo(() => scene.getElements().filter((e) => !e.isDeleted), [scene, revision])
  const fit = frozen ?? minimapFit(getElementsBounds(live), vrect, MINIMAP_W, MINIMAP_H, PADDING)

  useEffect(() => {
    if (!visible) return
    const raf = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!canvas || !ctx) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = MINIMAP_W * dpr
      canvas.height = MINIMAP_H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const c = COLORS[theme]
      for (const el of live) {
        const b = getElementBounds(el)
        const w = b.width * fit.scale
        const h = b.height * fit.scale
        // Sub-pixel elements add cost and no information.
        if (w < 1 && h < 1) continue
        const p = sceneToMinimap({ x: b.x, y: b.y }, fit)
        ctx.globalAlpha = Math.max(el.opacity, 10) / 100
        if (el.type === "frame") {
          ctx.strokeStyle = c.frame
          ctx.strokeRect(p.x, p.y, w, h)
          continue
        }
        const hasFill = el.backgroundColor !== "transparent"
        ctx.fillStyle =
          el.type === "image"
            ? c.image
            : resolveColor(hasFill ? el.backgroundColor : el.strokeColor, theme)
        if (!hasFill && el.type !== "image") ctx.globalAlpha *= 0.5
        if (el.type === "ellipse") {
          ctx.beginPath()
          ctx.ellipse(p.x + w / 2, p.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(p.x, p.y, Math.max(w, 1), Math.max(h, 1))
        }
      }
      ctx.globalAlpha = 1
    })
    return () => cancelAnimationFrame(raf)
  }, [visible, live, fit.scale, fit.originX, fit.originY, fit.offsetX, fit.offsetY, theme])

  if (!visible) return null

  const panTo = (e: React.PointerEvent<HTMLDivElement>, f: MinimapFit): void => {
    const r = e.currentTarget.getBoundingClientRect()
    const target = minimapToScene({ x: e.clientX - r.left, y: e.clientY - r.top }, f)
    const s = useAppStore.getState()
    s.setView(
      centerViewOn(target, { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, vw, vh),
    )
  }
  const end = (e: React.PointerEvent<HTMLDivElement>): void => {
    dragging.current = false
    setFrozen(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const vp0 = sceneToMinimap({ x: vrect.x, y: vrect.y }, fit)
  return (
    <div
      data-testid="minimap"
      data-scroll-x={Math.round(scrollX)}
      data-scroll-y={Math.round(scrollY)}
      aria-label={t("minimap.label")}
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      className={`absolute bottom-28 z-30 touch-none overflow-hidden rounded-lg border border-subtle bg-panel shadow ${className}`}
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        dragging.current = true
        setFrozen(fit)
        e.currentTarget.setPointerCapture(e.pointerId)
        panTo(e, fit)
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        if (dragging.current) panTo(e, fit)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <canvas
        ref={canvasRef}
        style={{ width: MINIMAP_W, height: MINIMAP_H }}
        className="pointer-events-none absolute inset-0"
      />
      {live.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
          {t("minimap.empty")}
        </div>
      )}
      {live.length > 0 && (
        <div
          data-testid="minimap-viewport"
          className="pointer-events-none absolute border-2 border-accent bg-accent-soft"
          style={{
            left: vp0.x,
            top: vp0.y,
            width: vrect.width * fit.scale,
            height: vrect.height * fit.scale,
          }}
        />
      )}
      <button
        type="button"
        data-testid="minimap-close"
        aria-label={t("minimap.close")}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => useAppStore.getState().toggleMinimap()}
        className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded text-xs text-muted hover:bg-panel-hover"
      >
        ×
      </button>
    </div>
  )
}
