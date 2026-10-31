import type { ExcalidrawRectangleElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { filledShapeOptions } from "./options"

export const rectangleOptions: (e: ExcalidrawRectangleElement) => Options = filledShapeOptions

export const rectangleShape = (
  e: ExcalidrawRectangleElement,
  gen: RoughGenerator,
): readonly Drawable[] => {
  if (e.roundness === null) {
    return [gen.rectangle(0, 0, e.width, e.height, rectangleOptions(e))]
  }
  const w = e.width
  const h = e.height
  const r = Math.min(Math.min(w, h) * 0.25, 32)
  const path =
    `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} ` +
    `L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} ` +
    `L ${r} ${h} Q 0 ${h} 0 ${h - r} ` +
    `L 0 ${r} Q 0 0 ${r} 0 Z`
  return [gen.path(path, rectangleOptions(e))]
}
