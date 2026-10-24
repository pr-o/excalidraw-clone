import { fontSpec, wrapCellText } from "@excalidraw-clone/renderer"
import {
  autoGrowRows,
  deleteCol,
  deleteRow,
  insertCol,
  insertRow,
  setCellText,
  type CountLines,
  type ExcalidrawElement,
  type ExcalidrawTableElement,
  type TextSpan,
} from "@excalidraw-clone/scene"

/** Canvas line counter in the table's font, the same wrapping the renderer
 *  uses; installed as the scene's table measurer. Null without a 2D canvas
 *  (bare jsdom). */
export function tableLineCounter(t: ExcalidrawTableElement): CountLines | null {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  return (text, maxWidth, bold, spans) =>
    wrapCellText(text, spans, bold, maxWidth, (s, b, i) => {
      ctx.font = fontSpec(t.fontSize, t.fontFamily, b ? "bold" : "normal", i ? "italic" : "normal")
      return ctx.measureText(s).width
    }).lines.length
}

/** Rows grown so every cell's wrapped text fits (never shrunk). Returns the
 *  table unchanged when no 2D canvas is available (bare jsdom). */
export function growTableRows(t: ExcalidrawTableElement): ExcalidrawTableElement {
  const count = tableLineCounter(t)
  return count ? autoGrowRows(t, count) : t
}

export type TableOp =
  | "addRow"
  | "addCol"
  | "delRow"
  | "delCol"
  | "insertRowAbove"
  | "insertRowBelow"
  | "insertColLeft"
  | "insertColRight"

/** Apply a structure edit to the table `id` in a mutation draft. `cell` is the
 *  target row/col; without one the last row/column is used. */
export function applyTableOp(
  draft: ExcalidrawElement[],
  id: string,
  op: TableOp,
  cell?: { row: number; col: number } | null,
): void {
  const i = draft.findIndex((e) => e.id === id)
  const t = draft[i]
  if (!t || t.type !== "table") return
  const row = Math.min(t.rows - 1, Math.max(0, cell?.row ?? t.rows - 1))
  const col = Math.min(t.cols - 1, Math.max(0, cell?.col ?? t.cols - 1))
  const next = (() => {
    switch (op) {
      case "addRow":
      case "insertRowBelow":
        return insertRow(t, row + 1)
      case "insertRowAbove":
        return insertRow(t, row)
      case "addCol":
      case "insertColRight":
        return insertCol(t, col + 1)
      case "insertColLeft":
        return insertCol(t, col)
      case "delRow":
        return deleteRow(t, row)
      case "delCol":
        return deleteCol(t, col)
    }
  })()
  if (next !== t) draft[i] = next
}

/** Commit one cell's text (and its spans, when given), growing rows to fit;
 *  `appendRow` adds a row first-class (Tab on the last cell) in the same mutation. */
export function commitTableCell(
  draft: ExcalidrawElement[],
  id: string,
  row: number,
  col: number,
  text: string,
  appendRow = false,
  spans?: readonly TextSpan[],
): void {
  const i = draft.findIndex((e) => e.id === id)
  const t = draft[i]
  if (!t || t.type !== "table") return
  let next = setCellText(t, row, col, text, spans)
  if (appendRow) next = insertRow(next, next.rows)
  if (next !== t) draft[i] = growTableRows(next)
}
