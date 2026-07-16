import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { arrowShape } from "./arrow"
import { diamondShape } from "./diamond"
import { ellipseShape } from "./ellipse"
import { freedrawShape } from "./freedraw"
import { lineShape } from "./line"
import { rectangleShape } from "./rectangle"

export const generateShape = (
  element: ExcalidrawElement,
  gen: RoughGenerator,
): readonly Drawable[] => {
  switch (element.type) {
    case "rectangle":
      return rectangleShape(element, gen)
    case "ellipse":
      return ellipseShape(element, gen)
    case "diamond":
      return diamondShape(element, gen)
    case "line":
      return lineShape(element, gen)
    case "arrow":
      return arrowShape(element, gen)
    case "freedraw":
      return freedrawShape(element, gen)
    case "frame":
      return rectangleShape({ ...element, type: "rectangle" }, gen)
    // Temporary passthrough — real polygon drawables land in the
    // flowchart-shapes Task 4.
    case "triangle":
    case "parallelogram":
    case "hexagon":
      return []
    case "text":
    case "image":
      return []
  }
}

export { rectangleShape, rectangleOptions } from "./rectangle"
export { ellipseShape } from "./ellipse"
export { diamondShape } from "./diamond"
export { lineShape } from "./line"
export { arrowShape } from "./arrow"
export { freedrawShape } from "./freedraw"
export { drawText } from "./text"
