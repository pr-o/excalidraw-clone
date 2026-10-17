import { mirrorOf } from "@excalidraw-clone/scene"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { RoughCanvas } from "roughjs/bin/canvas"
import type { ShapeCache } from "./shape-cache"
import { gradientLine, withFill } from "./shapes/gradient"
import { drawText } from "./shapes/text"
import { fontSpec } from "./text-metrics"
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
  if (element.type === "image" || element.type === "text") {
    const [mx, my] = mirrorOf(element)
    if (mx !== 1 || my !== 1) {
      ctx.translate(element.width / 2, element.height / 2)
      ctx.scale(mx, my)
      ctx.translate(-element.width / 2, -element.height / 2)
    }
  }
  if (element.type === "image") {
    const img = element.fileId === null ? undefined : getImage(element.fileId)
    if (img && img.complete && img.naturalWidth > 0) {
      const c = element.crop
      // imported elements may omit `crop`
      if (c == null) {
        ctx.drawImage(img, 0, 0, element.width, element.height)
      } else {
        const { naturalWidth: nw, naturalHeight: nh } = img
        ctx.drawImage(
          img,
          c.x * nw,
          c.y * nh,
          c.width * nw,
          c.height * nh,
          0,
          0,
          element.width,
          element.height,
        )
      }
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
  const line = gradientLine(element)
  if (line) {
    const grad = ctx.createLinearGradient(line.x1, line.y1, line.x2, line.y2)
    grad.addColorStop(0, resolveColor(element.backgroundColor, theme))
    grad.addColorStop(1, resolveColor(line.to, theme))
    for (const d of drawables) rough.draw(withFill(d, grad))
  } else {
    for (const d of drawables) rough.draw(d)
  }
  if (element.type === "frame") {
    ctx.font = fontSpec(12, 2)
    ctx.fillStyle = resolveColor("#868e96", theme)
    ctx.textBaseline = "bottom"
    ctx.textAlign = "left"
    ctx.fillText(element.name ?? "Frame", 0, -4)
  }
  ctx.restore()
}
