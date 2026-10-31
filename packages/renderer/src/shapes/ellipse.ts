import type { ExcalidrawEllipseElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { filledShapeOptions } from "./options"

export const ellipseShape = (
  e: ExcalidrawEllipseElement,
  gen: RoughGenerator,
): readonly Drawable[] => [
  gen.ellipse(e.width / 2, e.height / 2, e.width, e.height, filledShapeOptions(e)),
]
