import { GRADIENT_TYPES } from "@excalidraw-clone/scene"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"

export interface GradientLine {
  x1: number
  y1: number
  x2: number
  y2: number
  to: string
}

/** The element-local gradient axis spanning its bounding box, or null when the
 *  element has no gradient to draw (wrong type, non-solid or transparent fill).
 *  Gradient-capable shapes are GRADIENT_TYPES. */
export const gradientLine = (el: ExcalidrawElement): GradientLine | null => {
  const g = el.gradient
  if (!g || !GRADIENT_TYPES.has(el.type)) return null
  if (el.fillStyle !== "solid" || el.backgroundColor === "transparent") return null
  const rad = (g.angle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  // Half the box's extent projected on the axis, so both corners sit on a stop.
  const half = (Math.abs(dx * el.width) + Math.abs(dy * el.height)) / 2
  const cx = el.width / 2
  const cy = el.height / 2
  // Rounded so trig noise (cos 90° ≈ 6e-17) doesn't leak into SVG attributes.
  const r = (n: number): number => Math.round(n * 100) / 100 + 0 // +0 turns -0 into 0
  return {
    x1: r(cx - dx * half),
    y1: r(cy - dy * half),
    x2: r(cx + dx * half),
    y2: r(cy + dy * half),
    to: g.to,
  }
}

/** Rough's canvas and SVG backends both read `options.fill` for the solid
 *  fill path, so swapping it paints the gradient while keeping the outline.
 *  The canvas backend accepts a CanvasGradient there despite the string type. */
export const withFill = (d: Drawable, fill: string | CanvasGradient): Drawable => ({
  ...d,
  options: { ...d.options, fill: fill as string },
})

/** Whether drawable `index` of the element's shape takes the gradient: every
 *  path for plain shapes; for a table only its background fill (index 0 — it
 *  exists whenever a gradient applies), so the header tint stays a flat tint. */
export const gradientTakes = (el: ExcalidrawElement, index: number): boolean =>
  el.type !== "table" || index === 0
