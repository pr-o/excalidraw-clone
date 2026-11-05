import {
  type AlignmentGuide,
  type Bounds,
  type Point,
  type ViewTransform,
  type UserGuides,
  boundsCorners,
  boundsFromPoints,
  midpoint,
  pointAdd,
  resizeHandles,
  rotationHandlePoint,
  sceneToViewport,
} from "@excalidraw-clone/geometry"
import {
  type ExcalidrawElement,
  type ExcalidrawLinearElement,
  getElementBounds,
  getElementsBounds,
  isLinearElement,
  rotatedCorners,
} from "@excalidraw-clone/scene"
import type { Theme } from "./types"

const HANDLE_SIZE = 8
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

type Quad = [Point, Point, Point, Point]

const linearViewportPoints = (e: ExcalidrawLinearElement, view: ViewTransform): Point[] =>
  e.points.map((p) => sceneToViewport(pointAdd(e, p), view))

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
  if (isLinearElement(e)) {
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
    rotatedCorners(e).map((p) => sceneToViewport(p, view)),
    theme,
  )
}

const drawElementChrome = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawElement,
  view: ViewTransform,
  theme: Theme,
): void => {
  if (isLinearElement(e)) {
    const absV = linearViewportPoints(e, view)
    // Ghost midpoints first so solid handles paint on top.
    for (let k = 0; k < absV.length - 1; k += 1) {
      drawGhostHandle(ctx, midpoint(absV[k]!, absV[k + 1]!), theme)
    }
    for (const p of absV) drawHandle(ctx, p, theme)
    return
  }
  drawElementOutline(ctx, e, view, theme)
  const corners = rotatedCorners(e).map((p) => sceneToViewport(p, view)) as Quad
  for (const h of resizeHandles(corners)) drawHandle(ctx, h.at, theme)
  const rotPoint = rotationHandlePoint(corners[0], corners[1])
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
  const corners = boundsCorners(bounds).map((p) => sceneToViewport(p, view)) as Quad
  strokePolygon(ctx, corners, theme)
  for (const h of resizeHandles(corners)) drawHandle(ctx, h.at, theme)
}

export interface DrawSelectionChromeOptions {
  /** True for the dedicated overlay canvas (clear it first); false when overlaying on the main canvas (preserve existing draws). */
  clearBackground: boolean
  /** Device pixels per CSS pixel of the target canvas (see `pixelRatioOf`). */
  pixelRatio?: number
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
  // Everything after this draws in CSS pixels; guides, lasso and measurements reuse it.
  const r = options.pixelRatio ?? 1
  ctx.setTransform(r, 0, 0, r, 0, 0)
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
    const { x, y, width, height } = boundsFromPoints([a, b])
    ctx.setLineDash([5, 5])
    ctx.strokeStyle = SELECTION_STROKE[theme]
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, width, height)
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

const USER_GUIDE_STROKE: Record<Theme, string> = {
  light: "#0ea5e9",
  dark: "#38bdf8",
}

/** Ruler guides spanning the visible scene rect. Expects `ctx` already in
 *  scene space (the main canvas's element transform), so 1/zoom is 1 screen px. */
export const drawUserGuides = (
  ctx: CanvasRenderingContext2D,
  guides: UserGuides,
  view: Bounds,
  zoom: number,
  theme: Theme,
): void => {
  if (guides.x.length + guides.y.length === 0) return
  ctx.save()
  ctx.strokeStyle = USER_GUIDE_STROKE[theme]
  ctx.lineWidth = 1 / zoom
  for (const gx of guides.x) {
    ctx.beginPath()
    ctx.moveTo(gx, view.y)
    ctx.lineTo(gx, view.y + view.height)
    ctx.stroke()
  }
  for (const gy of guides.y) {
    ctx.beginPath()
    ctx.moveTo(view.x, gy)
    ctx.lineTo(view.x + view.width, gy)
    ctx.stroke()
  }
  ctx.restore()
}
