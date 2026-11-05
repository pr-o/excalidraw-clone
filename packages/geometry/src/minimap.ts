import type { Bounds, Point } from "./types"

/** Uniform scene -> minimap mapping: minimap = (scene - origin) * scale + offset. */
export interface MinimapFit {
  scale: number
  originX: number
  originY: number
  offsetX: number
  offsetY: number
}

/** Fit the union of content bounds and the viewport into a w x h panel, centred, with padding. */
export const minimapFit = (
  content: Bounds | null,
  viewport: Bounds,
  w: number,
  h: number,
  padding: number,
): MinimapFit => {
  const x0 = Math.min(viewport.x, content?.x ?? Infinity)
  const y0 = Math.min(viewport.y, content?.y ?? Infinity)
  const x1 = Math.max(viewport.x + viewport.width, content ? content.x + content.width : -Infinity)
  const y1 = Math.max(
    viewport.y + viewport.height,
    content ? content.y + content.height : -Infinity,
  )
  const bw = Math.max(x1 - x0, 1)
  const bh = Math.max(y1 - y0, 1)
  const scale = Math.min((w - 2 * padding) / bw, (h - 2 * padding) / bh)
  return {
    scale,
    originX: x0,
    originY: y0,
    offsetX: (w - bw * scale) / 2,
    offsetY: (h - bh * scale) / 2,
  }
}

export const sceneToMinimap = (p: Point, f: MinimapFit): Point => ({
  x: (p.x - f.originX) * f.scale + f.offsetX,
  y: (p.y - f.originY) * f.scale + f.offsetY,
})

export const minimapToScene = (p: Point, f: MinimapFit): Point => ({
  x: (p.x - f.offsetX) / f.scale + f.originX,
  y: (p.y - f.offsetY) / f.scale + f.originY,
})
