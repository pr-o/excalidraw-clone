import type { ExcalidrawTextElement } from "@excalidraw-clone/scene"
import { fontSpec, layoutLabel } from "../text-metrics"

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

  ctx.save()
  ctx.font = fontSpec(e.fontSize, e.fontFamily)
  let fontSize = e.fontSize
  let lines: readonly string[] = e.text.split("\n")
  if (opts?.fit) {
    const layout = layoutLabel(
      e.text,
      { width: e.width, height: e.height },
      e.fontSize,
      e.lineHeight,
      (s) => ctx.measureText(s).width,
    )
    lines = layout.lines
    if (layout.scale < 1) {
      fontSize = e.fontSize * layout.scale
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
