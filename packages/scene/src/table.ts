import { rotatePoint, type Point } from "@excalidraw-clone/geometry"
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from "./defaults"
import type { ExcalidrawElement, ExcalidrawTableElement } from "./types"

export const TABLE_MIN_ROW = 28
export const TABLE_MIN_COL = 40
export const TABLE_DEFAULT_ROW = 40
export const TABLE_DEFAULT_COL = 120
export const TABLE_DEFAULT_ROWS = 3
export const TABLE_DEFAULT_COLS = 3
export const TABLE_MAX_TRACKS = 50
/** Cell text inset (px), horizontal and vertical. */
export const TABLE_PAD_X = 8
export const TABLE_PAD_Y = 6
export const TABLE_LINE_HEIGHT = 1.25

const EPS = 1e-6

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

const clampTracks = (n: number): number => Math.min(TABLE_MAX_TRACKS, Math.max(1, Math.floor(n)))

const evenSplit = (total: number, n: number): number[] => Array.from({ length: n }, () => total / n)

export const isTable = (e: ExcalidrawElement): e is ExcalidrawTableElement => e.type === "table"

/** Geometry for a fresh table: an even split of the box (grown to the minimum
 *  size); no box ⟹ the default 120x40 cells. */
export const tableGeometry = (
  rows: number,
  cols: number,
  box?: { width: number; height: number },
): { colWidths: number[]; rowHeights: number[]; width: number; height: number } => {
  const colWidths = evenSplit(
    box ? Math.max(box.width, cols * TABLE_MIN_COL) : cols * TABLE_DEFAULT_COL,
    cols,
  )
  const rowHeights = evenSplit(
    box ? Math.max(box.height, rows * TABLE_MIN_ROW) : rows * TABLE_DEFAULT_ROW,
    rows,
  )
  return { colWidths, rowHeights, width: sum(colWidths), height: sum(rowHeights) }
}

export const emptyCells = (rows: number, cols: number): string[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""))

const fitTrack = (sizes: readonly number[], target: number, min: number): readonly number[] => {
  const goal = Math.max(target, sizes.length * min)
  const total = sum(sizes)
  if (Math.abs(total - goal) < EPS) return sizes
  const scaled = total > 0 ? sizes.map((s) => (s * goal) / total) : evenSplit(goal, sizes.length)
  return scaled.map((s) => Math.max(min, s))
}

/** Restore `width === sum(colWidths)` / `height === sum(rowHeights)` after the
 *  element's box was written directly (resize handle, multi-resize, stats
 *  panel): columns/rows scale proportionally, never below the minimum size.
 *  Returns the same object when already consistent. */
export const fitTable = (t: ExcalidrawTableElement): ExcalidrawTableElement => {
  const wellFormed =
    t.colWidths?.length === t.cols &&
    t.rowHeights?.length === t.rows &&
    t.cells?.length === t.rows &&
    t.cells.every((r) => r.length === t.cols)
  const base = wellFormed
    ? t
    : (sanitizeTable(t as unknown as Record<string, unknown>) as unknown as ExcalidrawTableElement)
  const colWidths = fitTrack(base.colWidths, base.width, TABLE_MIN_COL)
  const rowHeights = fitTrack(base.rowHeights, base.height, TABLE_MIN_ROW)
  const width = sum(colWidths)
  const height = sum(rowHeights)
  if (base === t && colWidths === t.colWidths && rowHeights === t.rowHeights) {
    if (t.width === width && t.height === height) return t
  }
  return { ...base, colWidths, rowHeights, width, height }
}

/** Mutate-time invariant: keep every live table's geometry consistent. */
export const reconcileTables = (draft: ExcalidrawElement[]): void => {
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (e.type !== "table") continue
    const fitted = fitTable(e)
    if (fitted !== e) draft[i] = fitted
  }
}

const withSizes = (
  t: ExcalidrawTableElement,
  patch: Partial<ExcalidrawTableElement>,
): ExcalidrawTableElement => {
  const next = { ...t, ...patch }
  return { ...next, width: sum(next.colWidths), height: sum(next.rowHeights) }
}

const clampIndex = (i: number, n: number): number => Math.min(n - 1, Math.max(0, i))

/** Insert a row so it ends up at `index` (0..rows); a no-op at the 50-row cap. */
export const insertRow = (t: ExcalidrawTableElement, index: number): ExcalidrawTableElement => {
  if (t.rows >= TABLE_MAX_TRACKS) return t
  const at = Math.min(t.rows, Math.max(0, index))
  const height = t.rowHeights[clampIndex(at === t.rows ? at - 1 : at, t.rows)]!
  const rowHeights = [...t.rowHeights.slice(0, at), height, ...t.rowHeights.slice(at)]
  const cells = [...t.cells.slice(0, at), Array(t.cols).fill(""), ...t.cells.slice(at)]
  return withSizes(t, { rows: t.rows + 1, rowHeights, cells })
}

export const insertCol = (t: ExcalidrawTableElement, index: number): ExcalidrawTableElement => {
  if (t.cols >= TABLE_MAX_TRACKS) return t
  const at = Math.min(t.cols, Math.max(0, index))
  const width = t.colWidths[clampIndex(at === t.cols ? at - 1 : at, t.cols)]!
  const colWidths = [...t.colWidths.slice(0, at), width, ...t.colWidths.slice(at)]
  const cells = t.cells.map((r) => [...r.slice(0, at), "", ...r.slice(at)])
  return withSizes(t, { cols: t.cols + 1, colWidths, cells })
}

/** Delete a row; the last remaining row can't be deleted. */
export const deleteRow = (t: ExcalidrawTableElement, index: number): ExcalidrawTableElement => {
  if (t.rows <= 1 || index < 0 || index >= t.rows) return t
  return withSizes(t, {
    rows: t.rows - 1,
    rowHeights: t.rowHeights.filter((_, i) => i !== index),
    cells: t.cells.filter((_, i) => i !== index),
  })
}

export const deleteCol = (t: ExcalidrawTableElement, index: number): ExcalidrawTableElement => {
  if (t.cols <= 1 || index < 0 || index >= t.cols) return t
  return withSizes(t, {
    cols: t.cols - 1,
    colWidths: t.colWidths.filter((_, i) => i !== index),
    cells: t.cells.map((r) => r.filter((_, i) => i !== index)),
  })
}

export const setCellText = (
  t: ExcalidrawTableElement,
  row: number,
  col: number,
  text: string,
): ExcalidrawTableElement => {
  if (row < 0 || row >= t.rows || col < 0 || col >= t.cols || t.cells[row]![col] === text) {
    return t
  }
  return {
    ...t,
    cells: t.cells.map((r, ri) => (ri === row ? r.map((c, ci) => (ci === col ? text : c)) : r)),
  }
}

/** Set one column's width / one row's height (clamped to the minimum); the
 *  table's own width/height follow. */
export const setTrackSize = (
  t: ExcalidrawTableElement,
  axis: "col" | "row",
  index: number,
  size: number,
): ExcalidrawTableElement => {
  const key = axis === "col" ? "colWidths" : "rowHeights"
  const min = axis === "col" ? TABLE_MIN_COL : TABLE_MIN_ROW
  const tracks = t[key]
  if (index < 0 || index >= tracks.length) return t
  return withSizes(t, { [key]: tracks.map((s, i) => (i === index ? Math.max(min, size) : s)) })
}

export interface CellRect {
  x: number
  y: number
  width: number
  height: number
}

/** Cell box in table-local coordinates (origin at the table's top-left). */
export const cellRect = (t: ExcalidrawTableElement, row: number, col: number): CellRect => ({
  x: sum(t.colWidths.slice(0, col)),
  y: sum(t.rowHeights.slice(0, row)),
  width: t.colWidths[col]!,
  height: t.rowHeights[row]!,
})

/** Scene point -> table-local point (undoing the table's rotation). */
export const toTableLocal = (t: ExcalidrawTableElement, p: Point): Point => {
  const center: Point = { x: t.x + t.width / 2, y: t.y + t.height / 2 }
  const q = t.angle === 0 ? p : rotatePoint(p, center, -t.angle)
  return { x: q.x - t.x, y: q.y - t.y }
}

const trackAt = (sizes: readonly number[], v: number): number => {
  let edge = 0
  for (let i = 0; i < sizes.length; i += 1) {
    edge += sizes[i]!
    if (v < edge || i === sizes.length - 1) return i
  }
  return -1
}

/** Cell under a table-local point, or null outside the table. */
export const cellAtLocal = (
  t: ExcalidrawTableElement,
  p: Point,
): { row: number; col: number } | null =>
  p.x < 0 || p.y < 0 || p.x > t.width || p.y > t.height
    ? null
    : { row: trackAt(t.rowHeights, p.y), col: trackAt(t.colWidths, p.x) }

/** Interior column/row border within `tol` of a table-local point. `index` is
 *  the column/row whose far edge is the border. Outer edges are not borders. */
export const borderAtLocal = (
  t: ExcalidrawTableElement,
  p: Point,
  tol: number,
): { axis: "col" | "row"; index: number } | null => {
  if (p.x < -tol || p.y < -tol || p.x > t.width + tol || p.y > t.height + tol) return null
  let best: { axis: "col" | "row"; index: number; d: number } | null = null
  let edge = 0
  for (let i = 0; i < t.cols - 1; i += 1) {
    edge += t.colWidths[i]!
    const d = Math.abs(p.x - edge)
    if (d <= tol && (!best || d < best.d)) best = { axis: "col", index: i, d }
  }
  edge = 0
  for (let i = 0; i < t.rows - 1; i += 1) {
    edge += t.rowHeights[i]!
    const d = Math.abs(p.y - edge)
    if (d <= tol && (!best || d < best.d)) best = { axis: "row", index: i, d }
  }
  return best && { axis: best.axis, index: best.index }
}

/** Row heights grown (never shrunk) so each row fits its wrapped cell text.
 *  `countLines(text, maxWidth, bold)` is the host's wrapping measurer. */
export const autoGrowRows = (
  t: ExcalidrawTableElement,
  countLines: (text: string, maxWidth: number, bold: boolean) => number,
): ExcalidrawTableElement => {
  const lineHeight = t.fontSize * TABLE_LINE_HEIGHT
  let changed = false
  const rowHeights = t.rowHeights.map((h, r) => {
    let need = h
    for (let c = 0; c < t.cols; c += 1) {
      const text = t.cells[r]![c]!
      if (text === "") continue
      const lines = countLines(text, t.colWidths[c]! - 2 * TABLE_PAD_X, t.headerRow && r === 0)
      need = Math.max(need, lines * lineHeight + 2 * TABLE_PAD_Y)
    }
    if (need > h) changed = true
    return need
  })
  return changed ? withSizes(t, { rowHeights }) : t
}

/** All cell text, for find-on-canvas. */
export const tableText = (t: ExcalidrawTableElement): string =>
  t.cells.map((r) => r.join(" ")).join("\n")

const finite = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback

const sizesOf = (v: unknown, n: number, min: number, fallback: number): number[] => {
  const raw = Array.isArray(v) ? v : []
  return Array.from({ length: n }, (_, i) => Math.max(min, finite(raw[i], fallback)))
}

/** Trust-boundary normalizer for a persisted table: clamps rows/cols to 1..50,
 *  pads/truncates the track and cell arrays to match, coerces cells to strings,
 *  and re-derives width/height from the tracks. Invalid input becomes a
 *  default 3x3 table (keeping the element's id/position/style fields). */
export const sanitizeTable = (el: Record<string, unknown>): Record<string, unknown> => {
  const valid = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v)
  const rows = valid(el.rows) ? clampTracks(el.rows as number) : TABLE_DEFAULT_ROWS
  const cols = valid(el.cols) ? clampTracks(el.cols as number) : TABLE_DEFAULT_COLS
  const colWidths = sizesOf(el.colWidths, cols, TABLE_MIN_COL, TABLE_DEFAULT_COL)
  const rowHeights = sizesOf(el.rowHeights, rows, TABLE_MIN_ROW, TABLE_DEFAULT_ROW)
  const rawCells = Array.isArray(el.cells) ? el.cells : []
  const cells = Array.from({ length: rows }, (_, r) => {
    const row = Array.isArray(rawCells[r]) ? (rawCells[r] as unknown[]) : []
    return Array.from({ length: cols }, (_, c) => {
      const v = row[c]
      return typeof v === "string"
        ? v
        : typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : ""
    })
  })
  const family = el.fontFamily
  return {
    ...el,
    rows,
    cols,
    colWidths,
    rowHeights,
    cells,
    width: sum(colWidths),
    height: sum(rowHeights),
    headerRow: typeof el.headerRow === "boolean" ? el.headerRow : true,
    fontSize: valid(el.fontSize) && (el.fontSize as number) > 0 ? el.fontSize : DEFAULT_FONT_SIZE,
    fontFamily: family === 1 || family === 2 || family === 3 ? family : DEFAULT_FONT_FAMILY,
    textAlign: el.textAlign === "center" || el.textAlign === "right" ? el.textAlign : "left",
  }
}
