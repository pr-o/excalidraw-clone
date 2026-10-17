"use client"
import { rulerTickStep, rulerTicks } from "@excalidraw-clone/geometry"
import type { Scene } from "@excalidraw-clone/scene"
import React, { useEffect, useRef, useState } from "react"
import { useAppStore } from "../store"
import { applyGuideDrag, guideValueAt, RULER_SIZE, type GuideDrag } from "../driver/userGuides"

const COLORS = {
  light: { bg: "#f8f9fa", tick: "#adb5bd", text: "#495057", marker: "#0ea5e9" },
  dark: { bg: "#232329", tick: "#5c5f66", text: "#ced4da", marker: "#38bdf8" },
} as const

/** Top ruler (labels scene x, drags out horizontal guides) or left ruler
 *  (labels scene y, drags out vertical guides). */
function RulerStrip({ side, scene }: { side: "top" | "left"; scene: Scene }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  const drag = useRef<GuideDrag | null>(null)
  const scroll = useAppStore((s) => (side === "top" ? s.scrollX : s.scrollY))
  const zoom = useAppStore((s) => s.zoom)
  const theme = useAppStore((s) => s.resolvedTheme)
  const pointer = useAppStore((s) =>
    s.lastScenePointer ? s.lastScenePointer[side === "top" ? "x" : "y"] : null,
  )
  const [, setResizeTick] = useState(0)

  useEffect(() => {
    const onResize = (): void => setResizeTick((n) => n + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const length = side === "top" ? canvas.clientWidth : canvas.clientHeight
    const w = side === "top" ? length : RULER_SIZE
    const h = side === "top" ? RULER_SIZE : length
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    const c = COLORS[theme]
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = c.bg
    ctx.fillRect(0, 0, w, h)
    // Draw both rulers as the top one: swapping x/y makes the left ruler's
    // first coordinate run down the screen and its second run away from the edge.
    if (side === "left") ctx.transform(0, 1, 1, 0, 0, 0)
    ctx.strokeStyle = c.tick
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, RULER_SIZE - 0.5)
    ctx.lineTo(length, RULER_SIZE - 0.5)
    const stepPx = rulerTickStep(zoom) * zoom
    const ticks = rulerTicks(scroll, zoom, length)
    const first = ticks[0]?.px ?? 0
    for (let px = first - stepPx; px <= length; px += stepPx / 5) {
      const x = Math.round(px) + 0.5
      ctx.moveTo(x, RULER_SIZE - 5)
      ctx.lineTo(x, RULER_SIZE)
    }
    for (const t of ticks) {
      const x = Math.round(t.px) + 0.5
      ctx.moveTo(x, 4)
      ctx.lineTo(x, RULER_SIZE)
    }
    ctx.stroke()
    ctx.fillStyle = c.text
    ctx.font = "9px sans-serif"
    ctx.textBaseline = "top"
    for (const t of ticks) {
      if (side === "top") {
        ctx.fillText(String(t.value), t.px + 3, 2)
      } else {
        // Undo the axis swap so labels read bottom-to-top along the left ruler.
        ctx.save()
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.translate(2, t.px - 3)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(String(t.value), 0, 0)
        ctx.restore()
      }
    }
    if (pointer !== null) {
      const x = Math.round((pointer + scroll) * zoom) + 0.5
      ctx.strokeStyle = c.marker
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, RULER_SIZE)
      ctx.stroke()
    }
  })

  const axis = side === "top" ? "y" : "x"
  const toGuide = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drag.current) return
    const r = e.currentTarget.parentElement!.getBoundingClientRect()
    const s = useAppStore.getState()
    const value = guideValueAt(
      axis,
      { x: e.clientX - r.left, y: e.clientY - r.top },
      { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom },
    )
    drag.current = applyGuideDrag(scene, drag.current, value)
  }
  const end = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <canvas
      ref={ref}
      data-testid={`ruler-${side}`}
      className={`absolute z-10 touch-none ${
        side === "top"
          ? "left-0 top-0 h-5 w-full cursor-row-resize"
          : "left-0 top-0 h-full w-5 cursor-col-resize"
      }`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { axis, index: -1 }
      }}
      onPointerMove={toGuide}
      onPointerUp={end}
      onPointerCancel={end}
    />
  )
}

/** Rulers along the canvas's top and left edges. Pointer events land only on
 *  the two strips; the corner square just covers their overlap. */
export function Rulers({ scene }: { scene: Scene }): React.ReactElement | null {
  const visible = useAppStore((s) => s.rulersVisible && !s.presenting)
  if (!visible) return null
  return (
    <>
      <RulerStrip side="top" scene={scene} />
      <RulerStrip side="left" scene={scene} />
      <div className="absolute left-0 top-0 z-10 h-5 w-5 bg-panel-subtle" aria-hidden />
    </>
  )
}
