import { mirroredShapeVertices } from "@excalidraw-clone/geometry"
import type {
  ExcalidrawHexagonElement,
  ExcalidrawOctagonElement,
  ExcalidrawParallelogramElement,
  ExcalidrawPentagonElement,
  ExcalidrawTriangleElement,
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
    e.mirror ?? [1, 1],
  ).map((p) => [p.x, p.y])
  return [gen.polygon(points, filledShapeOptions(e))]
}
