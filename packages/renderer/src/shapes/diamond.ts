import type { ExcalidrawDiamondElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { filledShapeOptions } from "./options"

export const diamondShape = (
  e: ExcalidrawDiamondElement,
  gen: RoughGenerator,
): readonly Drawable[] => {
  const points: RoughPoint[] = [
    [e.width / 2, 0],
    [e.width, e.height / 2],
    [e.width / 2, e.height],
    [0, e.height / 2],
  ]
  return [gen.polygon(points, filledShapeOptions(e))]
}
