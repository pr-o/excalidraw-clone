import type { ExcalidrawLineElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { arrowheadDrawables } from "./arrowheads"
import { strokeLineDash } from "./stroke-dash"

const linearOptions = (e: ExcalidrawLineElement): Options => ({
  stroke: e.strokeColor,
  strokeWidth: e.strokeWidth,
  roughness: e.roughness,
  seed: e.seed,
  strokeLineDash: strokeLineDash(e.strokeStyle),
})

export const lineShape = (e: ExcalidrawLineElement, gen: RoughGenerator): readonly Drawable[] => {
  if (e.points.length < 2) return []
  const opts = linearOptions(e)
  const pts: RoughPoint[] = e.points.map((p) => [p.x, p.y])
  const drawables: Drawable[] = [gen.linearPath(pts, opts)]
  if (e.endArrowhead) {
    drawables.push(
      ...arrowheadDrawables(e.endArrowhead, pts[pts.length - 1]!, pts[pts.length - 2]!, gen, opts),
    )
  }
  if (e.startArrowhead) {
    drawables.push(...arrowheadDrawables(e.startArrowhead, pts[0]!, pts[1]!, gen, opts))
  }
  return drawables
}
