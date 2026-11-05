import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { diamondShape } from "./diamond"
import { ellipseShape } from "./ellipse"
import { freedrawShape } from "./freedraw"
import { linearShape } from "./linear"
import { polygonShape } from "./polygon"
import { rectangleShape } from "./rectangle"
import { tableShape } from "./table"

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
    case "arrow":
      return linearShape(element, gen)
    case "freedraw":
      return freedrawShape(element, gen)
    case "frame":
      return rectangleShape({ ...element, type: "rectangle" }, gen)
    case "table":
      return tableShape(element, gen)
    case "triangle":
    case "parallelogram":
    case "hexagon":
    case "pentagon":
    case "octagon":
      return polygonShape(element, gen)
    case "text":
    case "image":
      return []
  }
}
