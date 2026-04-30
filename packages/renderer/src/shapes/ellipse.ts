import type { ExcalidrawEllipseElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"

const ellipseOptions = (e: ExcalidrawEllipseElement): Options => {
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

export const ellipseShape = (
  e: ExcalidrawEllipseElement,
  gen: RoughGenerator,
): readonly Drawable[] => [
  gen.ellipse(e.width / 2, e.height / 2, e.width, e.height, ellipseOptions(e)),
]
