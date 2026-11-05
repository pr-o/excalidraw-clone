import {
  measureGaps,
  sceneToViewport,
  type Bounds,
  type GapMeasurement,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import {
  getElementBounds,
  getElementsBounds,
  isBoundLabel,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"
import type { Theme } from "./types"

export interface SelectionMeasurements {
  bounds: Bounds
  /** The selection's size: a single shape's own width and height (unrotated),
   *  otherwise the combined bounding box. */
  width: number
  height: number
  gaps: GapMeasurement[]
}

const LINEAR = new Set(["line", "arrow", "freedraw"])

/**
 * The size of the selection and its distance to the nearest element on each
 * side. Neighbours are every other element except bound text labels (they sit
 * inside their container) and arrows attached to a selected element (they
 * touch it by design, so their gap is noise).
 */
export const selectionMeasurements = (
  elements: readonly ExcalidrawElement[],
  selection: readonly string[],
): SelectionMeasurements | null => {
  if (selection.length === 0) return null
  const selected = new Set(selection)
  const chosen = elements.filter((e) => selected.has(e.id) && !e.isDeleted)
  const bounds = getElementsBounds(chosen)
  if (!bounds) return null
  const attached = (e: ExcalidrawElement): boolean =>
    e.type === "arrow" &&
    ((e.startBinding !== null && selected.has(e.startBinding.elementId)) ||
      (e.endBinding !== null && selected.has(e.endBinding.elementId)))
  const others = elements
    .filter((e) => !selected.has(e.id) && !e.isDeleted && !isBoundLabel(e) && !attached(e))
    .map(getElementBounds)
  const single = chosen.length === 1 ? chosen[0] : undefined
  const own = single && !LINEAR.has(single.type) ? single : null
  return {
    bounds,
    width: own ? Math.abs(own.width) : bounds.width,
    height: own ? Math.abs(own.height) : bounds.height,
    gaps: measureGaps(bounds, others),
  }
}

const MEASURE_COLOR: Record<Theme, string> = {
  light: "#e03131",
  dark: "#ff8787",
}
const LABEL_TEXT: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#121212",
}
const SIZE_FILL: Record<Theme, string> = {
  light: "#6965db",
  dark: "#a5a5ff",
}

const FONT = "500 12px system-ui, sans-serif"
const PAD_X = 5
const LABEL_H = 18
const TICK = 4
/** Gap between the selection box's bottom edge and the size label, in screen px. */
const SIZE_OFFSET = 10
/** Space between two labels placed side by side, in screen px. */
const LABEL_GAP = 4

/** Distances read in whole units; one decimal only below 10, where it matters. */
export const formatMeasure = (n: number): string => {
  const r = Math.round(n * 10) / 10
  return r < 10 && !Number.isInteger(r) ? r.toFixed(1) : String(Math.round(n))
}

const drawLabel = (
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fill: string,
  color: string,
): void => {
  const w = ctx.measureText(text).width + PAD_X * 2
  ctx.fillStyle = fill
  const x = cx - w / 2
  const y = cy - LABEL_H / 2
  // Rounded pill where supported (all current browsers); square otherwise.
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath()
    ctx.roundRect(x, y, w, LABEL_H, 4)
    ctx.fill()
  } else {
    ctx.fillRect(x, y, w, LABEL_H)
  }
  ctx.fillStyle = color
  ctx.fillText(text, cx, cy)
}

/** Draws the read-outs in screen space (identity transform) on the overlay. */
export const drawMeasurements = (
  ctx: CanvasRenderingContext2D,
  m: SelectionMeasurements,
  view: ViewTransform,
  theme: Theme,
): void => {
  // Screen space (CSS px, at the canvas's pixel ratio) is already set by drawSelectionChrome.
  ctx.save()
  ctx.font = FONT
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineWidth = 1
  ctx.setLineDash([])
  // The size label goes first in layout (under the box) so gap labels can avoid it.
  const bottomMid = sceneToViewport(
    { x: m.bounds.x + m.bounds.width / 2, y: m.bounds.y + m.bounds.height },
    view,
  )
  const sizeText = `${formatMeasure(m.width)} × ${formatMeasure(m.height)}`
  const sizeCenter = { x: bottomMid.x, y: bottomMid.y + SIZE_OFFSET + LABEL_H / 2 }
  const sizeHalfW = ctx.measureText(sizeText).width / 2 + PAD_X
  for (const g of m.gaps) {
    const a = sceneToViewport(
      g.axis === "x" ? { x: g.from, y: g.at } : { x: g.at, y: g.from },
      view,
    )
    const b = sceneToViewport(g.axis === "x" ? { x: g.to, y: g.at } : { x: g.at, y: g.to }, view)
    ctx.strokeStyle = MEASURE_COLOR[theme]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    // End ticks, across the line.
    for (const p of [a, b]) {
      if (g.axis === "x") {
        ctx.moveTo(p.x, p.y - TICK)
        ctx.lineTo(p.x, p.y + TICK)
      } else {
        ctx.moveTo(p.x - TICK, p.y)
        ctx.lineTo(p.x + TICK, p.y)
      }
    }
    ctx.stroke()
    const text = formatMeasure(g.distance)
    const halfW = ctx.measureText(text).width / 2 + PAD_X
    let cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    // A short gap below the box puts its label on the size label: move it beside the line.
    if (Math.abs(cx - sizeCenter.x) < halfW + sizeHalfW && Math.abs(cy - sizeCenter.y) < LABEL_H) {
      cx = sizeCenter.x + sizeHalfW + halfW + LABEL_GAP
    }
    drawLabel(ctx, text, cx, cy, MEASURE_COLOR[theme], LABEL_TEXT[theme])
  }
  drawLabel(ctx, sizeText, sizeCenter.x, sizeCenter.y, SIZE_FILL[theme], LABEL_TEXT[theme])
  ctx.restore()
}
