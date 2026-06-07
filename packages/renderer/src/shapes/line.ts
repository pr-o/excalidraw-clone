import type { ExcalidrawLineElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
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
  const pts: RoughPoint[] = e.points.map((p) => [p.x, p.y])
  return [gen.linearPath(pts, linearOptions(e))]
}
