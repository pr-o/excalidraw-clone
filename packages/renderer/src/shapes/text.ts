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

export const drawText = (ctx: CanvasRenderingContext2D, e: ExcalidrawTextElement): void => {
  if (e.text.length === 0) return
  const lines = e.text.split("\n")
  const lineHeightPx = e.fontSize * e.lineHeight
  const totalHeight = lines.length * lineHeightPx

  ctx.save()
  ctx.font = fontSpec(e.fontSize, e.fontFamily)
  ctx.fillStyle = e.strokeColor
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
