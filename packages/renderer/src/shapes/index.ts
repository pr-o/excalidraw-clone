import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { rectangleShape } from "./rectangle"

export const generateShape = (
  element: ExcalidrawElement,
  gen: RoughGenerator,
): readonly Drawable[] => {
  switch (element.type) {
    case "rectangle":
      return rectangleShape(element, gen)
    case "diamond":
    case "ellipse":
    case "line":
    case "arrow":
    case "freedraw":
    case "text":
    case "image":
    case "frame":
      return []
  }
}

export { rectangleShape, rectangleOptions } from "./rectangle"
