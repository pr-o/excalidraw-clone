import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { RoughCanvas } from "roughjs/bin/canvas"
import type { ShapeCache } from "./shape-cache"
import { drawText } from "./shapes/text"

export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  rough: RoughCanvas,
  cache: ShapeCache,
): void => {
  if (element.isDeleted) return
  if (element.type === "image") return
  ctx.save()
  ctx.translate(element.x, element.y)
  if (element.angle !== 0) {
    ctx.translate(element.width / 2, element.height / 2)
    ctx.rotate(element.angle)
    ctx.translate(-element.width / 2, -element.height / 2)
  }
  if (element.type === "text") {
    drawText(ctx, element)
    ctx.restore()
    return
  }
  const drawables = cache.get(element, rough.generator)
  for (const d of drawables) rough.draw(d)
  ctx.restore()
}
