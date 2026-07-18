import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { RoughCanvas } from "roughjs/bin/canvas"
import type { ShapeCache } from "./shape-cache"
import { drawText } from "./shapes/text"
import { resolveColor } from "./theme-colors"
import type { Theme } from "./types"

export type ImageLookup = (fileId: string) => HTMLImageElement | undefined

export interface LabelDrawOptions {
  occlusionBg?: string
  fit?: boolean
}

export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  rough: RoughCanvas,
  cache: ShapeCache,
  getImage: ImageLookup,
  theme: Theme = "light",
  labelOpts?: LabelDrawOptions,
): void => {
  if (element.isDeleted) return
  ctx.save()
  ctx.translate(element.x, element.y)
  if (element.angle !== 0) {
    ctx.translate(element.width / 2, element.height / 2)
    ctx.rotate(element.angle)
    ctx.translate(-element.width / 2, -element.height / 2)
  }
  if (element.type === "image") {
    const img = element.fileId === null ? undefined : getImage(element.fileId)
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, element.width, element.height)
    }
    ctx.restore()
    return
  }
  if (element.type === "text") {
    drawText(ctx, element, resolveColor(element.strokeColor, theme), {
      occlude:
        labelOpts?.occlusionBg === undefined ? undefined : { background: labelOpts.occlusionBg },
      fit: labelOpts?.fit,
    })
    ctx.restore()
    return
  }
  const drawables = cache.get(element, rough.generator, theme)
  for (const d of drawables) rough.draw(d)
  ctx.restore()
}
