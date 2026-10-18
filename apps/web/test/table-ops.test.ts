import {
  newRectangle,
  newTable,
  setCellText,
  Scene,
  type ExcalidrawElement,
  type ExcalidrawTableElement,
} from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import { applyPropertiesPatch } from "../src/driver/applyPropertiesPatch"
import { applyTableOp, commitTableCell, growTableRows } from "../src/driver/tableOps"
import { createFontAwareStubContext } from "./fontAwareCanvasStub"

const tbl = (): ExcalidrawTableElement => ({ ...newTable({ x: 0, y: 0 }), id: "T" })
const run = (
  op: Parameters<typeof applyTableOp>[2],
  cell?: { row: number; col: number } | null,
) => {
  const draft: ExcalidrawElement[] = [tbl()]
  applyTableOp(draft, "T", op, cell)
  return draft[0] as ExcalidrawTableElement
}

describe("applyTableOp", () => {
  it("add/delete without an active cell act on the last row/column", () => {
    expect(run("addRow").rows).toBe(4)
    expect(run("addCol").cols).toBe(4)
    const t = setCellText(setCellText(tbl(), 2, 0, "last"), 0, 0, "first")
    const draft: ExcalidrawElement[] = [t]
    applyTableOp(draft, "T", "delRow")
    expect((draft[0] as ExcalidrawTableElement).cells.flat()).toContain("first")
    expect((draft[0] as ExcalidrawTableElement).cells.flat()).not.toContain("last")
  })

  it("acts on the active cell's row/col", () => {
    const draft: ExcalidrawElement[] = [setCellText(tbl(), 0, 0, "first")]
    applyTableOp(draft, "T", "delRow", { row: 0, col: 0 })
    expect((draft[0] as ExcalidrawTableElement).cells.flat()).not.toContain("first")
  })

  it("insert above/below/left/right land next to the target cell", () => {
    const base = { row: 1, col: 1 }
    const marked = (op: Parameters<typeof applyTableOp>[2]) => {
      const draft: ExcalidrawElement[] = [setCellText(tbl(), 1, 1, "X")]
      applyTableOp(draft, "T", op, base)
      const t = draft[0] as ExcalidrawTableElement
      return t.cells
        .flatMap((r, ri) => r.map((c, ci) => (c === "X" ? [ri, ci] : null)))
        .find(Boolean)
    }
    expect(marked("insertRowAbove")).toEqual([2, 1])
    expect(marked("insertRowBelow")).toEqual([1, 1])
    expect(marked("insertColLeft")).toEqual([1, 2])
    expect(marked("insertColRight")).toEqual([1, 1])
  })

  it("clamps a stale cell and ignores non-tables / unknown ids", () => {
    expect(run("delRow", { row: 99, col: 99 }).rows).toBe(2)
    const draft: ExcalidrawElement[] = [newRectangle({ x: 0, y: 0, width: 5, height: 5 })]
    const before = draft[0]
    applyTableOp(draft, "nope", "addRow")
    expect(draft[0]).toBe(before)
  })

  it("is one undo step through Scene.mutate", () => {
    const scene = new Scene([tbl()])
    scene.mutate((d) => applyTableOp(d, "T", "addRow"))
    expect((scene.getElements()[0] as ExcalidrawTableElement).rows).toBe(4)
    scene.undo()
    expect((scene.getElements()[0] as ExcalidrawTableElement).rows).toBe(3)
  })
})

describe("row auto-grow with a 2D context", () => {
  let spy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>
  beforeEach(() => {
    spy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createFontAwareStubContext())
  })
  afterEach(() => spy.mockRestore())

  // stub: 10px per char at fontSize 20; inner cell width 104 => 10 chars per line
  it("grows the row on commit to fit wrapped text and never shrinks it", () => {
    const draft: ExcalidrawElement[] = [tbl()]
    commitTableCell(draft, "T", 1, 0, "aaaa bbbb cccc dddd eeee")
    const t = draft[0] as ExcalidrawTableElement
    // 3 wrapped lines * 25 + 12 = 87
    expect(t.rowHeights[1]).toBeGreaterThan(40)
    expect(t.height).toBe(t.rowHeights.reduce((a, b) => a + b, 0))
    const grown = t.rowHeights[1]!
    commitTableCell(draft, "T", 1, 0, "a")
    expect((draft[0] as ExcalidrawTableElement).rowHeights[1]).toBe(grown)
  })

  it("header row measures bold (wider)", () => {
    const t = setCellText(setCellText(tbl(), 0, 0, "aaaaaaaaaa"), 1, 0, "aaaaaaaaaa")
    const grown = growTableRows(t)
    // 10 chars: normal fits in one line; bold (x1.2) wraps... a single word stays whole => 1 line each
    expect(grown.rowHeights[0]).toBe(40)
  })

  it("a font change re-wraps through applyPropertiesPatch", () => {
    const t = setCellText(tbl(), 0, 0, "aaaa bbbb cccc")
    const out = applyPropertiesPatch(t, { fontSize: 36 }) as ExcalidrawTableElement
    expect(out.fontSize).toBe(36)
    expect(out.rowHeights[0]).toBeGreaterThan(40)
  })

  it("a non-font patch leaves the geometry alone", () => {
    const t = tbl()
    expect(applyPropertiesPatch(t, { headerRow: false })).toMatchObject({ headerRow: false })
  })
})
