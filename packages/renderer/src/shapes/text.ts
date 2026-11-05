import type { ExcalidrawTextElement } from "@excalidraw-clone/scene"
import { sliceRuns } from "@excalidraw-clone/scene"
import {
  alignAnchorX,
  alignTopY,
  fontSpec,
  layoutLabel,
  makeMeasure,
  runFont,
  runLeft,
  splitLines,
  wrapRich,
  type WrappedLine,
} from "../text-metrics"

/** Free text the user gave a fixed width (side-handle resize): it word-wraps
 *  at e.width. Missing autoResize (old documents) counts as auto-resizing. */
export const isFixedWidthText = (e: ExcalidrawTextElement): boolean =>
  e.containerId === null && e.autoResize === false

/** Padding (px) around a linear-element label's occlusion backing rect. */
export const OCCLUSION_PADDING = 4

export interface TextOcclusion {
  background: string
}

export interface TextDrawOptions {
  occlude?: TextOcclusion | undefined
  fit?: boolean | undefined
}

export const drawText = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawTextElement,
  fillColor?: string,
  opts?: TextDrawOptions,
): void => {
  if (e.text.length === 0) return

  ctx.save()
  const weight = e.fontWeight ?? "normal"
  const style = e.fontStyle ?? "normal"
  const rich = (e.spans?.length ?? 0) > 0
  const natural = makeMeasure(ctx, e.text, e.spans, e.fontSize, e.fontFamily, weight, style)
  let fontSize = e.fontSize
  let lines: readonly WrappedLine[]
  if (opts?.fit) {
    const layout = layoutLabel(
      e.text,
      { width: e.width, height: e.height },
      e.fontSize,
      e.lineHeight,
      natural,
      e.spans,
    )
    lines = layout.wrapped
    fontSize = e.fontSize * layout.scale
  } else if (isFixedWidthText(e)) {
    lines = wrapRich(e.text, e.spans, e.width, natural)
  } else {
    lines = splitLines(e.text)
  }
  const measure = makeMeasure(ctx, e.text, e.spans, fontSize, e.fontFamily, weight, style)
  const scale = fontSize / e.fontSize
  const lineHeightPx = fontSize * e.lineHeight
  const totalHeight = lines.length * lineHeightPx

  if (opts?.occlude) {
    let widest = 0
    for (const l of lines) widest = Math.max(widest, l.indent * scale + measure(l.text, l.start))
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

  const baseY = alignTopY(e.verticalAlign, e.height, totalHeight)
  if (!rich) {
    ctx.font = fontSpec(fontSize, e.fontFamily, weight, style)
    ctx.textAlign = e.textAlign
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i]!
      // Hanging indent only makes sense against a left edge.
      const x = alignAnchorX(e.textAlign, e.width) + (e.textAlign === "left" ? l.indent * scale : 0)
      ctx.fillText(l.text, x, baseY + i * lineHeightPx)
    }
    ctx.restore()
    return
  }

  // Rich text: draw run by run left-to-right, aligning the line by its total width.
  ctx.textAlign = "left"
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i]!
    const anchor =
      alignAnchorX(e.textAlign, e.width) + (e.textAlign === "left" ? l.indent * scale : 0)
    let x = runLeft(e.textAlign, anchor, measure(l.text, l.start))
    const y = baseY + i * lineHeightPx
    for (const r of sliceRuns(e.text, e.spans, l.start, l.start + l.text.length)) {
      ctx.font = runFont(fontSize, e.fontFamily, weight, style, r)
      ctx.fillText(r.text, x, y)
      x += ctx.measureText(r.text).width
    }
  }
  ctx.restore()
}
