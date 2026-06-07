import type { ExcalidrawDiamondElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { strokeLineDash } from "./stroke-dash"

const diamondOptions = (e: ExcalidrawDiamondElement): Options => {
  const opts: Options = {
    stroke: e.strokeColor,
    strokeWidth: e.strokeWidth,
    fillStyle: e.fillStyle,
    roughness: e.roughness,
    seed: e.seed,
    strokeLineDash: strokeLineDash(e.strokeStyle),
  }
  if (e.backgroundColor !== "transparent") opts.fill = e.backgroundColor
  return opts
}

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
  return [gen.polygon(points, diamondOptions(e))]
}
