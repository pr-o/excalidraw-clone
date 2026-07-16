import { shapeVertices } from "@excalidraw-clone/geometry"
import type {
  ExcalidrawHexagonElement,
  ExcalidrawParallelogramElement,
  ExcalidrawTriangleElement,
} from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { strokeLineDash } from "./stroke-dash"

type PolygonElement =
  | ExcalidrawTriangleElement
  | ExcalidrawParallelogramElement
  | ExcalidrawHexagonElement

const polygonOptions = (e: PolygonElement): Options => {
  const opts: Options = {
    stroke: e.strokeColor,
    strokeWidth: e.strokeWidth,
    fillStyle: e.fillStyle,
    roughness: e.roughness,
    seed: e.seed,
    strokeLineDash: strokeLineDash(e.strokeStyle),
  }
  if (e.backgroundColor !== "transparent") opts.fill = e.backgroundColor
  return opts
}

export const polygonShape = (e: PolygonElement, gen: RoughGenerator): readonly Drawable[] => {
  const points: RoughPoint[] = shapeVertices(e.type, {
    x: 0,
    y: 0,
    width: e.width,
    height: e.height,
  }).map((p) => [p.x, p.y])
  return [gen.polygon(points, polygonOptions(e))]
}
