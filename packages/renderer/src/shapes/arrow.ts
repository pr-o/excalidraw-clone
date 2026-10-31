import type { ExcalidrawArrowElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { arrowheadDrawables } from "./arrowheads"
import { strokeOptions } from "./options"

export const arrowShape = (e: ExcalidrawArrowElement, gen: RoughGenerator): readonly Drawable[] => {
  if (e.points.length < 2) return []
  const opts = strokeOptions(e)
  const pts: RoughPoint[] = e.points.map((p) => [p.x, p.y])
  const drawables: Drawable[] = [gen.linearPath(pts, opts)]
  if (e.endArrowhead) {
    const tip = pts[pts.length - 1]!
    const prev = pts[pts.length - 2]!
    drawables.push(...arrowheadDrawables(e.endArrowhead, tip, prev, gen, opts))
  }
  if (e.startArrowhead) {
    const tip = pts[0]!
    const next = pts[1]!
    drawables.push(...arrowheadDrawables(e.startArrowhead, tip, next, gen, opts))
  }
  return drawables
}
