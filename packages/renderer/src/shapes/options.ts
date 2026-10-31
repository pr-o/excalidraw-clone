import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Options } from "roughjs/bin/core"
import { strokeLineDash } from "./stroke-dash"

/** rough.js outline options shared by every stroked shape. */
export const strokeOptions = (e: ExcalidrawElement): Options => ({
  stroke: e.strokeColor,
  strokeWidth: e.strokeWidth,
  roughness: e.roughness,
  seed: e.seed,
  strokeLineDash: strokeLineDash(e.strokeStyle),
})

/** `strokeOptions` plus the fill style, and the fill colour unless transparent. */
export const filledShapeOptions = (e: ExcalidrawElement): Options => {
  const opts: Options = { ...strokeOptions(e), fillStyle: e.fillStyle }
  if (e.backgroundColor !== "transparent") opts.fill = e.backgroundColor
  return opts
}
