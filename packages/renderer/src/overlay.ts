import {
  type Bounds,
  type Point,
  type ViewTransform,
  rotatePoint,
  sceneToViewport,
} from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, getElementBounds } from "@excalidraw-clone/scene"
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

const elementCorners = (e: ExcalidrawElement): readonly Point[] => {
  const bounds: Bounds = {
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
  }
  const corners: Point[] = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ]
  if (e.angle === 0) return corners
  const center: Point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  return corners.map((c) => rotatePoint(c, center, e.angle))
}

const midPoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

const isLinear = (e: ExcalidrawElement): boolean => e.type === "arrow" || e.type === "line"

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

const drawElementChrome = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawElement,
  view: ViewTransform,
  theme: Theme,
): void => {
  if (isLinear(e)) {
    const pts = (e as { points: readonly Point[] }).points
    const absV = pts.map((p) => sceneToViewport({ x: e.x + p.x, y: e.y + p.y }, view))
    // Ghost midpoints first so solid handles paint on top.
    for (let k = 0; k < absV.length - 1; k += 1) {
      drawGhostHandle(ctx, midPoint(absV[k]!, absV[k + 1]!), theme)
    }
    for (const p of absV) drawHandle(ctx, p, theme)
    return
  }
  const corners = elementCorners(e).map((p) => sceneToViewport(p, view))
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(corners[0]!.x, corners[0]!.y)
  for (let i = 1; i < corners.length; i += 1) {
    ctx.lineTo(corners[i]!.x, corners[i]!.y)
  }
  ctx.closePath()
  ctx.stroke()

  const c0 = corners[0]!
  const c1 = corners[1]!
  const c2 = corners[2]!
  const c3 = corners[3]!
  const handles: Point[] = [
    c0,
    c1,
    c2,
    c3,
    midPoint(c0, c1),
    midPoint(c1, c2),
    midPoint(c2, c3),
    midPoint(c3, c0),
  ]
  for (const h of handles) drawHandle(ctx, h, theme)

  const topMid = midPoint(c0, c1)
  const dx = c1.x - c0.x
  const dy = c1.y - c0.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const rotPoint: Point = {
    x: topMid.x + nx * -ROTATION_HANDLE_OFFSET,
    y: topMid.y + ny * -ROTATION_HANDLE_OFFSET,
  }
  ctx.fillStyle = SELECTION_FILL[theme]
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.beginPath()
  ctx.arc(rotPoint.x, rotPoint.y, ROTATION_HANDLE_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
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
  if (highlightIds.length > 0) {
    const byId = new Map(elements.map((e) => [e.id, e]))
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
    const byId = new Map(elements.map((e) => [e.id, e]))
    for (const id of selection) {
      const e = byId.get(id)
      if (!e) continue
      void getElementBounds(e)
      drawElementChrome(ctx, e, view, theme)
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
