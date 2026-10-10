import {
  type AlignmentGuide,
  type Bounds,
  type Point,
  type ViewTransform,
  rotatePoint,
  sceneToViewport,
} from "@excalidraw-clone/geometry"
import {
  type ExcalidrawElement,
  getElementBounds,
  getElementsBounds,
} from "@excalidraw-clone/scene"
import type { Theme } from "./types"

const HANDLE_SIZE = 8
const ROTATION_HANDLE_OFFSET = 20
const ROTATION_HANDLE_RADIUS = 5

const SELECTION_STROKE: Record<Theme, string> = {
  light: "#6965db",
  dark: "#a5a5ff",
}

const SELECTION_FILL: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#121212",
}

const BINDING_HIGHLIGHT: Record<Theme, string> = {
  light: "#6965db",
  dark: "#a8a5ff",
}

export interface MarqueeBox {
  start: Point
  end: Point
}

const cornersOf = (b: Bounds): Point[] => [
  { x: b.x, y: b.y },
  { x: b.x + b.width, y: b.y },
  { x: b.x + b.width, y: b.y + b.height },
  { x: b.x, y: b.y + b.height },
]

const elementCorners = (e: ExcalidrawElement): readonly Point[] => {
  const corners = cornersOf(e)
  if (e.angle === 0) return corners
  const center: Point = { x: e.x + e.width / 2, y: e.y + e.height / 2 }
  return corners.map((c) => rotatePoint(c, center, e.angle))
}

const midPoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

const isLinear = (e: ExcalidrawElement): boolean => e.type === "arrow" || e.type === "line"

const linearViewportPoints = (e: ExcalidrawElement, view: ViewTransform): Point[] =>
  (e as { points: readonly Point[] }).points.map((p) =>
    sceneToViewport({ x: e.x + p.x, y: e.y + p.y }, view),
  )

/** Stroke the closed polygon through `pts` (viewport space). */
const strokePolygon = (
  ctx: CanvasRenderingContext2D,
  pts: readonly Point[],
  theme: Theme,
): void => {
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.lineWidth = 1
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.stroke()
}

/** Four corners (clockwise from top-left) plus the four edge midpoints. */
const cornerAndEdgeHandles = ([c0, c1, c2, c3]: readonly Point[]): Point[] => [
  c0!,
  c1!,
  c2!,
  c3!,
  midPoint(c0!, c1!),
  midPoint(c1!, c2!),
  midPoint(c2!, c3!),
  midPoint(c3!, c0!),
]

const drawHandle = (ctx: CanvasRenderingContext2D, p: Point, theme: Theme): void => {
  ctx.fillStyle = SELECTION_FILL[theme]
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.lineWidth = 1
  ctx.fillRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
  ctx.strokeRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
}

const drawGhostHandle = (ctx: CanvasRenderingContext2D, p: Point, theme: Theme): void => {
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.lineWidth = 1
  ctx.strokeRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
}

const drawElementOutline = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawElement,
  view: ViewTransform,
  theme: Theme,
): void => {
  if (isLinear(e)) {
    // An open polyline, not a closed polygon.
    const pts = linearViewportPoints(e, view)
    ctx.strokeStyle = SELECTION_STROKE[theme]
    ctx.lineWidth = 1
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    return
  }
  strokePolygon(
    ctx,
    elementCorners(e).map((p) => sceneToViewport(p, view)),
    theme,
  )
}

const drawElementChrome = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawElement,
  view: ViewTransform,
  theme: Theme,
): void => {
  if (isLinear(e)) {
    const absV = linearViewportPoints(e, view)
    // Ghost midpoints first so solid handles paint on top.
    for (let k = 0; k < absV.length - 1; k += 1) {
      drawGhostHandle(ctx, midPoint(absV[k]!, absV[k + 1]!), theme)
    }
    for (const p of absV) drawHandle(ctx, p, theme)
    return
  }
  drawElementOutline(ctx, e, view, theme)
  const corners = elementCorners(e).map((p) => sceneToViewport(p, view))
  for (const h of cornerAndEdgeHandles(corners)) drawHandle(ctx, h, theme)

  const [c0, c1] = corners as [Point, Point]
  const topMid = midPoint(c0, c1)
  const dx = c1.x - c0.x
  const dy = c1.y - c0.y
  const len = Math.hypot(dx, dy) || 1
  // Unit normal pointing out of the top edge.
  const rotPoint: Point = {
    x: topMid.x + (dy / len) * ROTATION_HANDLE_OFFSET,
    y: topMid.y - (dx / len) * ROTATION_HANDLE_OFFSET,
  }
  ctx.fillStyle = SELECTION_FILL[theme]
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.beginPath()
  ctx.arc(rotPoint.x, rotPoint.y, ROTATION_HANDLE_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

const drawGroupResizeChrome = (
  ctx: CanvasRenderingContext2D,
  elements: readonly ExcalidrawElement[],
  view: ViewTransform,
  theme: Theme,
): void => {
  const bounds = getElementsBounds(elements)
  if (!bounds) return
  const corners = cornersOf(bounds).map((p) => sceneToViewport(p, view))
  strokePolygon(ctx, corners, theme)
  for (const h of cornerAndEdgeHandles(corners)) drawHandle(ctx, h, theme)
}

export interface DrawSelectionChromeOptions {
  /** True for the dedicated overlay canvas (clear it first); false when overlaying on the main canvas (preserve existing draws). */
  clearBackground: boolean
}

export const drawSelectionChrome = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  selection: readonly string[],
  elements: readonly ExcalidrawElement[],
  view: ViewTransform,
  theme: Theme,
  marquee: MarqueeBox | null,
  highlightIds: readonly string[],
  options: DrawSelectionChromeOptions,
): void => {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (options.clearBackground) ctx.clearRect(0, 0, canvas.width, canvas.height)
  const byId = new Map(elements.map((e) => [e.id, e]))
  if (highlightIds.length > 0) {
    for (const id of highlightIds) {
      const e = byId.get(id)
      if (!e) continue
      const b = getElementBounds(e)
      const tl = sceneToViewport({ x: b.x, y: b.y }, view)
      const br = sceneToViewport({ x: b.x + b.width, y: b.y + b.height }, view)
      ctx.setLineDash([])
      ctx.strokeStyle = BINDING_HIGHLIGHT[theme]
      ctx.lineWidth = 2
      ctx.strokeRect(tl.x - 2, tl.y - 2, br.x - tl.x + 4, br.y - tl.y + 4)
    }
  }
  if (selection.length > 0) {
    const selectedElements = selection
      .map((id) => byId.get(id))
      .filter((e): e is ExcalidrawElement => !!e)
    if (selectedElements.length >= 2) {
      for (const e of selectedElements) drawElementOutline(ctx, e, view, theme)
      drawGroupResizeChrome(ctx, selectedElements, view, theme)
    } else {
      for (const e of selectedElements) drawElementChrome(ctx, e, view, theme)
    }
  }
  if (marquee) {
    const a = sceneToViewport(marquee.start, view)
    const b = sceneToViewport(marquee.end, view)
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    ctx.setLineDash([5, 5])
    ctx.strokeStyle = SELECTION_STROKE[theme]
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
  }
}

export const drawLasso = (
  ctx: CanvasRenderingContext2D,
  path: readonly Point[],
  view: ViewTransform,
  theme: Theme,
): void => {
  if (path.length < 2) return
  ctx.save()
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  path.forEach((p, i) => {
    const v = sceneToViewport(p, view)
    if (i === 0) ctx.moveTo(v.x, v.y)
    else ctx.lineTo(v.x, v.y)
  })
  ctx.stroke()
  ctx.restore()
}

export const drawAlignmentGuides = (
  ctx: CanvasRenderingContext2D,
  guides: readonly AlignmentGuide[],
  view: ViewTransform,
  theme: Theme,
): void => {
  if (guides.length === 0) return
  ctx.save()
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  for (const g of guides) {
    const from: Point =
      g.axis === "x" ? { x: g.position, y: g.start } : { x: g.start, y: g.position }
    const to: Point = g.axis === "x" ? { x: g.position, y: g.end } : { x: g.end, y: g.position }
    const a = sceneToViewport(from, view)
    const b = sceneToViewport(to, view)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
}
