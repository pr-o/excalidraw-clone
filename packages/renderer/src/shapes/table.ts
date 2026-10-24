import {
  cellRect,
  cellSpansAt,
  sliceRuns,
  TABLE_LINE_HEIGHT,
  TABLE_PAD_X,
  type ExcalidrawTableElement,
  type TextSpan,
} from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { wrapRich, type WrappedLine } from "../text-metrics"
import { parseHex } from "../theme-colors"
import { strokeLineDash } from "./stroke-dash"

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

/** Header-row tint: the stroke colour at ~12% alpha, so it follows the theme
 *  (the element handed to the shape generator already has theme-resolved colours). */
export const headerTint = (stroke: string): string => {
  const c = parseHex(stroke)
  return c ? `rgba(${c.r},${c.g},${c.b},0.12)` : "rgba(128,128,128,0.12)"
}

/** Fill, header tint, outer border and one line per interior border, in
 *  paint order. Lines go through rough.js, so roughness applies as elsewhere. */
export const tableShape = (t: ExcalidrawTableElement, gen: RoughGenerator): readonly Drawable[] => {
  const stroke: Options = {
    stroke: t.strokeColor,
    strokeWidth: t.strokeWidth,
    roughness: t.roughness,
    seed: t.seed,
    strokeLineDash: strokeLineDash(t.strokeStyle),
  }
  const out: Drawable[] = []
  const fill = (w: number, h: number, color: string): Drawable =>
    gen.rectangle(0, 0, w, h, { fill: color, fillStyle: "solid", stroke: "none", seed: t.seed })
  if (t.backgroundColor !== "transparent") out.push(fill(t.width, t.height, t.backgroundColor))
  if (t.headerRow) out.push(fill(t.width, t.rowHeights[0]!, headerTint(t.strokeColor)))
  out.push(gen.rectangle(0, 0, t.width, t.height, stroke))
  let x = 0
  for (let c = 0; c < t.cols - 1; c += 1) {
    x += t.colWidths[c]!
    out.push(gen.line(x, 0, x, t.height, { ...stroke, seed: t.seed + c + 1 }))
  }
  let y = 0
  for (let r = 0; r < t.rows - 1; r += 1) {
    y += t.rowHeights[r]!
    out.push(gen.line(0, y, t.width, y, { ...stroke, seed: t.seed + t.cols + r }))
  }
  return out
}

export interface TableCellRun {
  text: string
  /** Left edge in table-local px. */
  x: number
  bold: boolean
  italic: boolean
}

export interface TableCellLine {
  row: number
  col: number
  text: string
  /** Horizontal anchor in table-local px (per textAlign). */
  x: number
  /** Top of the line in table-local px. */
  y: number
  bold: boolean
  /** Formatted cells only: the line's style runs, positioned left to right. */
  runs?: TableCellRun[]
}

/** Width of one string in the table font; `bold` / `italic` select the face. */
export type TableMeasure = (text: string, bold: boolean, italic: boolean) => number

/** Cell text wrapped at `maxWidth` (the cell's inner width), with a
 *  run-aware width function; `bold` is the header row's base weight. */
export const wrapCellText = (
  text: string,
  spans: readonly TextSpan[] | undefined,
  bold: boolean,
  maxWidth: number,
  measure: TableMeasure,
): { lines: WrappedLine[]; width: (s: string, start: number) => number } => {
  const width = (s: string, start: number): number =>
    spans
      ? sum(
          sliceRuns(text, spans, start, start + s.length).map((r) =>
            measure(r.text, bold || r.bold, r.italic),
          ),
        )
      : measure(s, bold, false)
  return { lines: wrapRich(text, spans, maxWidth, width), width }
}

/** Wrapped, vertically centred lines for every non-empty cell. */
export const layoutTableCells = (
  t: ExcalidrawTableElement,
  measure: TableMeasure,
): TableCellLine[] => {
  const out: TableCellLine[] = []
  const lineHeight = t.fontSize * TABLE_LINE_HEIGHT
  for (let row = 0; row < t.rows; row += 1) {
    const bold = t.headerRow && row === 0
    for (let col = 0; col < t.cols; col += 1) {
      const text = t.cells[row]![col]!
      if (text === "") continue
      const spans = cellSpansAt(t, row, col)
      const rect = cellRect(t, row, col)
      const inner = rect.width - 2 * TABLE_PAD_X
      const { lines, width } = wrapCellText(text, spans, bold, inner, measure)
      const top = rect.y + (rect.height - lines.length * lineHeight) / 2
      const x =
        t.textAlign === "center"
          ? rect.x + rect.width / 2
          : t.textAlign === "right"
            ? rect.x + rect.width - TABLE_PAD_X
            : rect.x + TABLE_PAD_X
      lines.forEach((l, i) => {
        // Hanging bullet indent only makes sense against a left edge.
        const indent = t.textAlign === "left" ? l.indent : 0
        const line: TableCellLine = {
          row,
          col,
          text: l.text,
          x: x + indent,
          y: top + i * lineHeight,
          bold,
        }
        if (spans) {
          const total = width(l.text, l.start)
          let left =
            t.textAlign === "center"
              ? x - total / 2
              : t.textAlign === "right"
                ? x - total
                : x + indent
          line.runs = sliceRuns(text, spans, l.start, l.start + l.text.length).map((r) => {
            const run = { text: r.text, x: left, bold: bold || r.bold, italic: r.italic }
            left += measure(r.text, run.bold, r.italic)
            return run
          })
        }
        out.push(line)
      })
    }
  }
  return out
}
