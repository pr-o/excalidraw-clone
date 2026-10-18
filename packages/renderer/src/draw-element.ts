import { elementShadow, mirrorOf } from "@excalidraw-clone/scene"
import type { ExcalidrawElement, ExcalidrawTableElement } from "@excalidraw-clone/scene"
import type { RoughCanvas } from "roughjs/bin/canvas"
import type { ShapeCache } from "./shape-cache"
import { gradientLine, withFill } from "./shapes/gradient"
import { layoutTableCells } from "./shapes/table"
import { drawText } from "./shapes/text"
import { fontSpec } from "./text-metrics"
import { resolveColor } from "./theme-colors"
import type { Theme } from "./types"

export type ImageLookup = (fileId: string) => HTMLImageElement | undefined

export interface LabelDrawOptions {
  occlusionBg?: string
  fit?: boolean
  /** Table cell being edited in the DOM overlay: its text is not drawn. */
  hiddenCell?: { row: number; col: number }
}

/** Canvas shadow offsets/blur ignore the transform, so they are scaled by the view zoom. */
const setShadow = (ctx: CanvasRenderingContext2D, el: ExcalidrawElement, zoom: number): boolean => {
  const sh = elementShadow(el)
  if (!sh) return false
  // Deliberately not theme-mapped: resolveColor would turn a black shadow into a white glow.
  ctx.shadowColor = sh.color
  ctx.shadowBlur = sh.blur * zoom
  ctx.shadowOffsetX = sh.offsetX * zoom
  ctx.shadowOffsetY = sh.offsetY * zoom
  return true
}

const clearShadow = (ctx: CanvasRenderingContext2D): void => {
  ctx.shadowColor = "rgba(0,0,0,0)"
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  rough: RoughCanvas,
  cache: ShapeCache,
  getImage: ImageLookup,
  theme: Theme = "light",
  labelOpts?: LabelDrawOptions,
  zoom = 1,
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
      setShadow(ctx, element, zoom)
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
    setShadow(ctx, element, zoom)
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
  let grad: CanvasGradient | undefined
  if (line) {
    grad = ctx.createLinearGradient(line.x1, line.y1, line.x2, line.y2)
    grad.addColorStop(0, resolveColor(element.backgroundColor, theme))
    grad.addColorStop(1, resolveColor(line.to, theme))
  }
  const paint = (): void => {
    for (const d of drawables) rough.draw(grad ? withFill(d, grad) : d)
  }
  // Rough emits several overlapping paths (fill, double stroke), each of which would cast its own
  // shadow over the others. So: one pass that casts the shadow, then a shadowless repaint on top.
  if (setShadow(ctx, element, zoom)) {
    paint()
    clearShadow(ctx)
  }
  paint()
  if (element.type === "table") drawTableText(ctx, element, theme, labelOpts?.hiddenCell)
  if (element.type === "frame") {
    ctx.font = fontSpec(12, 2)
    ctx.fillStyle = resolveColor("#868e96", theme)
    ctx.textBaseline = "bottom"
    ctx.textAlign = "left"
    ctx.fillText(element.name ?? "Frame", 0, -4)
  }
  ctx.restore()
}

const drawTableText = (
  ctx: CanvasRenderingContext2D,
  t: ExcalidrawTableElement,
  theme: Theme,
  hidden: { row: number; col: number } | undefined,
): void => {
  const fontOf = (bold: boolean): string =>
    fontSpec(t.fontSize, t.fontFamily, bold ? "bold" : "normal")
  const lines = layoutTableCells(t, (s, bold) => {
    ctx.font = fontOf(bold)
    return ctx.measureText(s).width
  })
  ctx.fillStyle = resolveColor(t.strokeColor, theme)
  ctx.textBaseline = "top"
  ctx.textAlign = t.textAlign
  for (const l of lines) {
    if (hidden && l.row === hidden.row && l.col === hidden.col) continue
    ctx.font = fontOf(l.bold)
    ctx.fillText(l.text, l.x, l.y)
  }
}
