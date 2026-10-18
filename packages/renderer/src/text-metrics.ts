import { BULLET, sliceRuns, type FontFamily, type TextSpan } from "@excalidraw-clone/scene"

const FAMILY_NAMES: Record<FontFamily, string> = {
  1: '"Caveat", cursive',
  2: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  3: '"Cascadia Code", "Courier New", monospace',
}

export const fontFamilyName = (family: FontFamily): string => FAMILY_NAMES[family]

export type FontWeight = "normal" | "bold"
export type FontStyle = "normal" | "italic"

/** CSS/canvas font shorthand: `<style> <weight> <size>px <family>`. */
export const fontSpec = (
  fontSize: number,
  family: FontFamily,
  weight: FontWeight = "normal",
  style: FontStyle = "normal",
): string => `${style} ${weight} ${fontSize}px ${fontFamilyName(family)}`

export interface TextSize {
  width: number
  height: number
}

/** One laid-out line: its text, its offset into the source text, and the
 *  hanging indent (px at the measured size) of a bullet's wrapped continuation. */
export interface WrappedLine {
  text: string
  start: number
  indent: number
}

export interface LabelLayout {
  lines: string[]
  wrapped: WrappedLine[]
  scale: number
}

/** Width of `s`, which sits at offset `start` of the source text (rich text
 *  needs the offset to find the style runs; plain measurers ignore it). */
export type MeasureRange = (s: string, start: number) => number

/** Unwrapped lines (manual newlines only), with their source offsets. */
export const splitLines = (text: string): WrappedLine[] => {
  let start = 0
  return text.split("\n").map((line) => {
    const out = { text: line, start, indent: 0 }
    start += line.length + 1
    return out
  })
}

/** Greedy space-only wrap of each logical line at maxWidth (a word wider
 *  than maxWidth stays whole). Manual newlines are kept. Continuation lines
 *  of a bullet line ("• ") hang under the text, indented by the bullet's
 *  width. Plain text collapses runs of spaces; with `spans` the original
 *  spacing is kept (lines are exact slices of `text`, so runs line up). */
export const wrapRich = (
  text: string,
  spans: readonly TextSpan[] | undefined,
  maxWidth: number,
  measure: MeasureRange,
): WrappedLine[] => {
  const rich = (spans?.length ?? 0) > 0
  const lines: WrappedLine[] = []
  for (const logical of splitLines(text)) {
    const words: { text: string; start: number }[] = []
    let at = 0
    for (const w of logical.text.split(" ")) {
      if (w.length > 0) words.push({ text: w, start: logical.start + at })
      at += w.length + 1
    }
    if (words.length === 0) {
      lines.push({ text: "", start: logical.start, indent: 0 })
      continue
    }
    const indentW = logical.text.startsWith(BULLET) ? measure(BULLET, logical.start) : 0
    const build = (from: number, to: number): { text: string; start: number } => {
      const first = words[from]!
      const last = words[to]!
      return rich
        ? { text: text.slice(first.start, last.start + last.text.length), start: first.start }
        : {
            text: words
              .slice(from, to + 1)
              .map((w) => w.text)
              .join(" "),
            start: first.start,
          }
    }
    let from = 0
    let continuation = false
    for (let i = 1; i < words.length; i += 1) {
      const cand = build(from, i)
      const indent = continuation ? indentW : 0
      if (indent + measure(cand.text, cand.start) > maxWidth) {
        lines.push({ ...build(from, i - 1), indent })
        from = i
        continuation = true
      }
    }
    lines.push({ ...build(from, words.length - 1), indent: continuation ? indentW : 0 })
  }
  return lines
}

export const wrapLines = (
  text: string,
  maxWidth: number,
  measureWidth: (s: string) => number,
): string[] => wrapRich(text, undefined, maxWidth, (s) => measureWidth(s)).map((l) => l.text)

/** Display layout for a shape label: wrap at box.width, then the combined
 *  shrink scale — min(1, width bound, height bound) — for the wrapped block.
 *  measureWidth must measure at the natural font size. */
export const layoutLabel = (
  text: string,
  box: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  measureWidth: MeasureRange,
  spans?: readonly TextSpan[],
): LabelLayout => {
  const wrapped = wrapRich(text, spans, box.width, measureWidth)
  let widest = 0
  for (const l of wrapped) widest = Math.max(widest, l.indent + measureWidth(l.text, l.start))
  const totalHeight = wrapped.length * fontSize * lineHeight
  const scale = Math.min(
    1,
    widest > 0 ? box.width / widest : 1,
    totalHeight > 0 ? box.height / totalHeight : 1,
  )
  return { lines: wrapped.map((l) => l.text), wrapped, scale }
}

/** A run-aware width function over `text` at `fontSize`: each span run is
 *  measured with its own bold/italic font. Sets ctx.font (callers restore). */
export const makeMeasure = (
  ctx: CanvasRenderingContext2D,
  text: string,
  spans: readonly TextSpan[] | undefined,
  fontSize: number,
  family: FontFamily,
  weight: FontWeight,
  style: FontStyle,
): MeasureRange => {
  if ((spans?.length ?? 0) === 0) {
    ctx.font = fontSpec(fontSize, family, weight, style)
    return (s) => ctx.measureText(s).width
  }
  return (s, start) => {
    let w = 0
    for (const r of sliceRuns(text, spans, start, start + s.length)) {
      ctx.font = runFont(fontSize, family, weight, style, r)
      w += ctx.measureText(r.text).width
    }
    return w
  }
}

/** Font for one run: the element's base weight/style, upgraded by the run. */
export const runFont = (
  fontSize: number,
  family: FontFamily,
  weight: FontWeight,
  style: FontStyle,
  run: { bold: boolean; italic: boolean },
): string => fontSpec(fontSize, family, run.bold ? "bold" : weight, run.italic ? "italic" : style)

export const measureText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  family: FontFamily,
  lineHeight: number,
  weight: FontWeight = "normal",
  style: FontStyle = "normal",
  /** When set, lines are word-wrapped at this width (fixed-width text). */
  wrapWidth?: number,
  spans?: readonly TextSpan[],
): TextSize => {
  const prevFont = ctx.font
  let width = 0
  if ((spans?.length ?? 0) > 0) {
    const m = makeMeasure(ctx, text, spans, fontSize, family, weight, style)
    const rich = wrapWidth === undefined ? splitLines(text) : wrapRich(text, spans, wrapWidth, m)
    for (const l of rich) width = Math.max(width, l.indent + m(l.text, l.start))
    ctx.font = prevFont
    return { width, height: rich.length * fontSize * lineHeight }
  }
  ctx.font = fontSpec(fontSize, family, weight, style)
  const lines =
    wrapWidth === undefined
      ? text.split("\n")
      : wrapLines(text, wrapWidth, (s) => ctx.measureText(s).width)
  for (const line of lines) {
    const m = ctx.measureText(line)
    if (m.width > width) width = m.width
  }
  ctx.font = prevFont
  return { width, height: lines.length * fontSize * lineHeight }
}
