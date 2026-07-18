import type { ExcalidrawTextElement } from "@excalidraw-clone/scene"
import { fontSpec } from "../text-metrics"

const horizontalOffset = (e: ExcalidrawTextElement, lineWidth: number): number => {
  switch (e.textAlign) {
    case "center":
      return e.width / 2
    case "right":
      return e.width
    case "left":
    default:
      void lineWidth
      return 0
  }
}

const verticalOffset = (e: ExcalidrawTextElement, totalHeight: number): number => {
  switch (e.verticalAlign) {
    case "middle":
      return (e.height - totalHeight) / 2
    case "bottom":
      return e.height - totalHeight
    case "top":
    default:
      return 0
  }
}

/** Padding (px) around a linear-element label's occlusion backing rect. */
export const OCCLUSION_PADDING = 4

export interface TextOcclusion {
  background: string
}

export interface TextDrawOptions {
  occlude?: TextOcclusion | undefined
  fit?: boolean | undefined
}

const maxLineWidth = (ctx: CanvasRenderingContext2D, lines: readonly string[]): number => {
  let max = 0
  for (const line of lines) max = Math.max(max, ctx.measureText(line).width)
  return max
}

export const drawText = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawTextElement,
  fillColor?: string,
  opts?: TextDrawOptions,
): void => {
  if (e.text.length === 0) return
  const lines = e.text.split("\n")

  ctx.save()
  ctx.font = fontSpec(e.fontSize, e.fontFamily)
  let fontSize = e.fontSize
  if (opts?.fit) {
    const widest = maxLineWidth(ctx, lines)
    const naturalHeight = lines.length * e.fontSize * e.lineHeight
    const scale = Math.min(
      1,
      widest > 0 ? e.width / widest : 1,
      naturalHeight > 0 ? e.height / naturalHeight : 1,
    )
    if (scale < 1) {
      fontSize = e.fontSize * scale
      ctx.font = fontSpec(fontSize, e.fontFamily)
    }
  }
  const lineHeightPx = fontSize * e.lineHeight
  const totalHeight = lines.length * lineHeightPx

  if (opts?.occlude) {
    const widest = maxLineWidth(ctx, lines)
    ctx.fillStyle = opts.occlude.background
    ctx.fillRect(
      e.width / 2 - widest / 2 - OCCLUSION_PADDING,
      e.height / 2 - totalHeight / 2 - OCCLUSION_PADDING,
      widest + 2 * OCCLUSION_PADDING,
      totalHeight + 2 * OCCLUSION_PADDING,
    )
  }
  ctx.fillStyle = fillColor ?? e.strokeColor
  ctx.textBaseline = "top"
  ctx.textAlign = e.textAlign

  const baseY = verticalOffset(e, totalHeight)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const x = horizontalOffset(e, ctx.measureText(line).width)
    const y = baseY + i * lineHeightPx
    ctx.fillText(line, x, y)
  }
  ctx.restore()
}
