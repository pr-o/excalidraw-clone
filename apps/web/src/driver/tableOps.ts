import { fontSpec, wrapLines } from "@excalidraw-clone/renderer"
import {
  autoGrowRows,
  deleteCol,
  deleteRow,
  insertCol,
  insertRow,
  setCellText,
  type ExcalidrawElement,
  type ExcalidrawTableElement,
} from "@excalidraw-clone/scene"

/** Rows grown so every cell's wrapped text fits (never shrunk). Returns the
 *  table unchanged when no 2D canvas is available (bare jsdom). */
export function growTableRows(t: ExcalidrawTableElement): ExcalidrawTableElement {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return t
  return autoGrowRows(t, (text, maxWidth, bold) => {
    ctx.font = fontSpec(t.fontSize, t.fontFamily, bold ? "bold" : "normal")
    return wrapLines(text, maxWidth, (s) => ctx.measureText(s).width).length
  })
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

/** Commit one cell's text, growing rows to fit; `appendRow` adds a row first-class
 *  (Tab on the last cell) in the same mutation. */
export function commitTableCell(
  draft: ExcalidrawElement[],
  id: string,
  row: number,
  col: number,
  text: string,
  appendRow = false,
): void {
  const i = draft.findIndex((e) => e.id === id)
  const t = draft[i]
  if (!t || t.type !== "table") return
  let next = setCellText(t, row, col, text)
  if (appendRow) next = insertRow(next, next.rows)
  if (next !== t) draft[i] = growTableRows(next)
}
