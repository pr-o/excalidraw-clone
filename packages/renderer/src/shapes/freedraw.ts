import type { ExcalidrawFreedrawElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"

const freedrawOptions = (e: ExcalidrawFreedrawElement): Options => ({
  stroke: e.strokeColor,
  strokeWidth: e.strokeWidth,
  roughness: e.roughness,
  seed: e.seed,
})

export const freedrawShape = (
  e: ExcalidrawFreedrawElement,
  gen: RoughGenerator,
): readonly Drawable[] => {
  if (e.points.length < 2) return []
  const pts: RoughPoint[] = e.points.map((p) => [p.x, p.y])
  return [gen.curve(pts, freedrawOptions(e))]
}
