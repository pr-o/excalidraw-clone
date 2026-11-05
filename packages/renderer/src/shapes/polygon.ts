import { mirroredShapeVertices } from "@excalidraw-clone/geometry"
import {
  mirrorOf,
  type ExcalidrawHexagonElement,
  type ExcalidrawOctagonElement,
  type ExcalidrawParallelogramElement,
  type ExcalidrawPentagonElement,
  type ExcalidrawTriangleElement,
} from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { filledShapeOptions } from "./options"

type PolygonElement =
  | ExcalidrawTriangleElement
  | ExcalidrawParallelogramElement
  | ExcalidrawHexagonElement
  | ExcalidrawPentagonElement
  | ExcalidrawOctagonElement

export const polygonShape = (e: PolygonElement, gen: RoughGenerator): readonly Drawable[] => {
  const points: RoughPoint[] = mirroredShapeVertices(
    e.type,
    { x: 0, y: 0, width: e.width, height: e.height },
    mirrorOf(e),
  ).map((p) => [p.x, p.y])
  return [gen.polygon(points, filledShapeOptions(e))]
}
