import type { ExcalidrawArrowElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"

const ARROWHEAD_LENGTH = 20
const ARROWHEAD_ANGLE = Math.PI / 6

const arrowOptions = (e: ExcalidrawArrowElement): Options => ({
  stroke: e.strokeColor,
  strokeWidth: e.strokeWidth,
  roughness: e.roughness,
  seed: e.seed,
})

const arrowhead = (
  tip: RoughPoint,
  prev: RoughPoint,
  gen: RoughGenerator,
  opts: Options,
): readonly Drawable[] => {
  const dx = tip[0] - prev[0]
  const dy = tip[1] - prev[1]
  const baseAngle = Math.atan2(dy, dx)
  const left: RoughPoint = [
    tip[0] - ARROWHEAD_LENGTH * Math.cos(baseAngle - ARROWHEAD_ANGLE),
    tip[1] - ARROWHEAD_LENGTH * Math.sin(baseAngle - ARROWHEAD_ANGLE),
  ]
  const right: RoughPoint = [
    tip[0] - ARROWHEAD_LENGTH * Math.cos(baseAngle + ARROWHEAD_ANGLE),
    tip[1] - ARROWHEAD_LENGTH * Math.sin(baseAngle + ARROWHEAD_ANGLE),
  ]
  return [gen.linearPath([left, tip, right], opts)]
}

export const arrowShape = (e: ExcalidrawArrowElement, gen: RoughGenerator): readonly Drawable[] => {
  if (e.points.length < 2) return []
  const opts = arrowOptions(e)
  const pts: RoughPoint[] = e.points.map((p) => [p.x, p.y])
  const drawables: Drawable[] = [gen.linearPath(pts, opts)]
  if (e.endArrowhead) {
    const tip = pts[pts.length - 1]!
    const prev = pts[pts.length - 2]!
    for (const d of arrowhead(tip, prev, gen, opts)) drawables.push(d)
  }
  if (e.startArrowhead) {
    const tip = pts[0]!
    const next = pts[1]!
    for (const d of arrowhead(tip, next, gen, opts)) drawables.push(d)
  }
  return drawables
}
