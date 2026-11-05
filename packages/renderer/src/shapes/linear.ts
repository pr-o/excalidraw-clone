import type { ExcalidrawLinearElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { arrowheadDrawables } from "./arrowheads"
import { strokeOptions } from "./options"

/** An arrow or line: its path, then an arrowhead at each end that has one. */
export const linearShape = (
  e: ExcalidrawLinearElement,
  gen: RoughGenerator,
): readonly Drawable[] => {
  if (e.points.length < 2) return []
  const opts = strokeOptions(e)
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
