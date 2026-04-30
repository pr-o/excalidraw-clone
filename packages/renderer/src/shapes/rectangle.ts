import type { ExcalidrawRectangleElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"

export const rectangleOptions = (e: ExcalidrawRectangleElement): Options => {
  const opts: Options = {
    stroke: e.strokeColor,
    strokeWidth: e.strokeWidth,
    fillStyle: e.fillStyle,
    roughness: e.roughness,
    seed: e.seed,
  }
  if (e.backgroundColor !== "transparent") opts.fill = e.backgroundColor
  return opts
}

export const rectangleShape = (
  e: ExcalidrawRectangleElement,
  gen: RoughGenerator,
): readonly Drawable[] => [gen.rectangle(0, 0, e.width, e.height, rectangleOptions(e))]
