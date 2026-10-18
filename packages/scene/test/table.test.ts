import { describe, expect, it } from "vitest"
import {
  Scene,
  autoGrowRows,
  borderAtLocal,
  cellAtLocal,
  cellRect,
  computeStats,
  deleteCol,
  deleteRow,
  fitTable,
  getElementBounds,
  hitTestElement,
  insertCol,
  insertRow,
  newRectangle,
  newTable,
  resizeElements,
  sanitizeTable,
  setCellText,
  setTrackSize,
  tableText,
  toTableLocal,
  canBindTo,
} from "../src"
import type { ExcalidrawTableElement } from "../src"

const table = (over: Partial<ExcalidrawTableElement> = {}): ExcalidrawTableElement => ({
  ...newTable({ x: 10, y: 20 }),
  ...over,
})

describe("newTable", () => {
  it("defaults to 3x3 with 120x40 cells and a header row", () => {
    const t = newTable({ x: 0, y: 0 })
    expect([t.rows, t.cols, t.headerRow]).toEqual([3, 3, true])
    expect(t.colWidths).toEqual([120, 120, 120])
    expect(t.rowHeights).toEqual([40, 40, 40])
    expect([t.width, t.height]).toEqual([360, 120])
    expect(t.cells).toEqual([
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ])
  })

  it("splits a drag box evenly and enforces the minimum size", () => {
    const t = newTable({ x: 0, y: 0, width: 300, height: 150 })
    expect(t.colWidths).toEqual([100, 100, 100])
    expect(t.rowHeights).toEqual([50, 50, 50])
    const tiny = newTable({ x: 0, y: 0, width: 10, height: 10 })
    expect([tiny.width, tiny.height]).toEqual([120, 84])
  })
})

describe("structure ops", () => {
  it("insertRow / insertCol keep width and height equal to the track sums", () => {
    const t = setCellText(table(), 1, 1, "x")
    const r = insertRow(t, 1)
    expect(r.rows).toBe(4)
    expect(r.cells[1]).toEqual(["", "", ""])
    expect(r.cells[2]![1]).toBe("x")
    expect(r.height).toBe(160)
    const c = insertCol(t, 3)
    expect(c.cols).toBe(4)
    expect(c.cells[1]).toEqual(["", "x", "", ""])
    expect(c.width).toBe(480)
  })

  it("deleteRow / deleteCol remove the track and its cells; the last track stays", () => {
    const t = setCellText(setCellText(table(), 0, 0, "a"), 2, 2, "z")
    const r = deleteRow(t, 0)
    expect(r.rows).toBe(2)
    expect(r.cells[1]![2]).toBe("z")
    expect(r.height).toBe(80)
    const c = deleteCol(t, 2)
    expect(c.cols).toBe(2)
    expect(c.cells.every((row) => row.length === 2)).toBe(true)
    expect(c.width).toBe(240)
    const one = newTable({ x: 0, y: 0, rows: 1, cols: 1 })
    expect(deleteRow(one, 0)).toBe(one)
    expect(deleteCol(one, 0)).toBe(one)
  })

  it("caps at 50 rows/cols", () => {
    const big = newTable({ x: 0, y: 0, rows: 50, cols: 50 })
    expect(insertRow(big, 0)).toBe(big)
    expect(insertCol(big, 0)).toBe(big)
  })

  it("setCellText is a no-op for identical text or out-of-range cells", () => {
    const t = table()
    expect(setCellText(t, 0, 0, "")).toBe(t)
    expect(setCellText(t, 9, 0, "x")).toBe(t)
    expect(setCellText(t, 0, 2, "hi").cells[0]![2]).toBe("hi")
  })

  it("setTrackSize clamps to the minimum and moves the table size", () => {
    const t = table()
    const w = setTrackSize(t, "col", 1, 200)
    expect([w.colWidths, w.width]).toEqual([[120, 200, 120], 440])
    expect(setTrackSize(t, "col", 0, 5).colWidths[0]).toBe(40)
    const h = setTrackSize(t, "row", 2, 10)
    expect([h.rowHeights[2], h.height]).toEqual([28, 108])
  })
})

describe("scale-resize invariant", () => {
  it("fitTable scales columns and rows proportionally to the new box", () => {
    const t = setTrackSize(table(), "col", 0, 60) // 60,120,120 = 300
    const fitted = fitTable({ ...t, width: 600, height: 240 })
    expect(fitted.colWidths).toEqual([120, 240, 240])
    expect(fitted.rowHeights).toEqual([80, 80, 80])
    expect([fitted.width, fitted.height]).toEqual([600, 240])
  })

  it("never shrinks below the minimum track size", () => {
    const fitted = fitTable({ ...table(), width: 10, height: 10 })
    expect(fitted.colWidths).toEqual([40, 40, 40])
    expect(fitted.rowHeights).toEqual([28, 28, 28])
    expect([fitted.width, fitted.height]).toEqual([120, 84])
  })

  it("returns the same object when already consistent", () => {
    const t = table()
    expect(fitTable(t)).toBe(t)
  })

  it("Scene.mutate reconciles a directly written box", () => {
    const t = table()
    const scene = new Scene([t])
    scene.mutate((d) => {
      d[0] = { ...d[0]!, width: 720, height: 240 }
    })
    const out = scene.getElements()[0] as ExcalidrawTableElement
    expect(out.colWidths).toEqual([240, 240, 240])
    expect(out.rowHeights).toEqual([80, 80, 80])
  })

  it("multi-element resize reaches tables through the same path", () => {
    const t = table({ x: 0, y: 0 })
    const r = newRectangle({ x: 400, y: 0, width: 100, height: 100 })
    const out = resizeElements(
      [t, r],
      [t.id, r.id],
      { x: 0, y: 0, width: 500, height: 120 },
      {
        x: 0,
        y: 0,
        width: 1000,
        height: 240,
      },
    )
    const scene = new Scene([t, r])
    scene.mutate((d) => {
      for (const o of out) d[d.findIndex((e) => e.id === o.id)] = o
    })
    const tt = scene.getElements()[0] as ExcalidrawTableElement
    expect([tt.width, tt.height]).toEqual([720, 240])
    expect(tt.colWidths).toEqual([240, 240, 240])
  })

  it("repairs a malformed table inside mutate", () => {
    const bad = { ...table(), cols: 2, colWidths: [100], cells: [["a"]] } as ExcalidrawTableElement
    const scene = new Scene([])
    scene.mutate((d) => {
      d.push(bad)
    })
    const out = scene.getElements()[0] as ExcalidrawTableElement
    expect(out.colWidths).toHaveLength(2)
    expect(out.cells.every((r) => r.length === 2)).toBe(true)
  })
})

describe("cell and border lookup", () => {
  const t = setTrackSize(table(), "col", 0, 60) // cols 60,120,120
  it("cellRect gives the local box", () => {
    expect(cellRect(t, 1, 2)).toEqual({ x: 180, y: 40, width: 120, height: 40 })
  })
  it("cellAtLocal maps points to cells, null outside", () => {
    expect(cellAtLocal(t, { x: 1, y: 1 })).toEqual({ row: 0, col: 0 })
    expect(cellAtLocal(t, { x: 61, y: 41 })).toEqual({ row: 1, col: 1 })
    expect(cellAtLocal(t, { x: 300, y: 120 })).toEqual({ row: 2, col: 2 })
    expect(cellAtLocal(t, { x: 301, y: 5 })).toBeNull()
    expect(cellAtLocal(t, { x: -1, y: 5 })).toBeNull()
  })
  it("borderAtLocal finds interior borders within tolerance only", () => {
    expect(borderAtLocal(t, { x: 62, y: 70 }, 4)).toEqual({ axis: "col", index: 0 })
    expect(borderAtLocal(t, { x: 100, y: 41 }, 4)).toEqual({ axis: "row", index: 0 })
    expect(borderAtLocal(t, { x: 100, y: 70 }, 4)).toBeNull()
    // outer edges are resize-handle territory, not borders
    expect(borderAtLocal(t, { x: 300, y: 70 }, 4)).toBeNull()
    expect(borderAtLocal(t, { x: 100, y: 0 }, 4)).toBeNull()
  })
  it("toTableLocal undoes rotation", () => {
    const rotated = { ...table({ x: 0, y: 0 }), angle: Math.PI / 2 }
    // table center (180,60); local (0,0) rotated 90deg about it lands at (240,-120)
    const local = toTableLocal(rotated, { x: 240, y: -120 })
    expect(local.x).toBeCloseTo(0)
    expect(local.y).toBeCloseTo(0)
  })
})

describe("autoGrowRows", () => {
  const lines = (text: string): number => text.split("\n").length
  it("grows a row to fit wrapped text and never shrinks", () => {
    const t = setCellText(table(), 1, 0, "a\nb\nc")
    const grown = autoGrowRows(t, lines)
    // 3 lines * 20 * 1.25 + 12 = 87
    expect(grown.rowHeights).toEqual([40, 87, 40])
    expect(grown.height).toBe(167)
    expect(autoGrowRows(grown, () => 1)).toBe(grown)
  })
  it("passes the cell text width and header boldness to the measurer", () => {
    const seen: [number, boolean][] = []
    autoGrowRows(setCellText(setCellText(table(), 0, 0, "h"), 1, 0, "b"), (_t, w, bold) => {
      seen.push([w, bold])
      return 1
    })
    expect(seen).toEqual([
      [104, true],
      [104, false],
    ])
  })
})

describe("sanitizeTable", () => {
  it("clamps rows/cols, pads and truncates, coerces cells", () => {
    const out = sanitizeTable({
      rows: 99,
      cols: 0,
      colWidths: [100, "x"],
      rowHeights: [50],
      cells: [[1, null, { a: 1 }, "ok"]],
    }) as unknown as ExcalidrawTableElement
    expect(out.rows).toBe(50)
    expect(out.cols).toBe(1)
    expect(out.colWidths).toEqual([100])
    expect(out.rowHeights).toHaveLength(50)
    expect(out.rowHeights[1]).toBe(40)
    expect(out.cells[0]).toEqual(["1"])
    expect(out.cells[49]).toEqual([""])
    expect(out.width).toBe(100)
  })
  it("falls back to a default 3x3 table for garbage", () => {
    const out = sanitizeTable({
      rows: "a",
      cols: NaN,
      cells: "nope",
    }) as unknown as ExcalidrawTableElement
    expect([out.rows, out.cols, out.headerRow]).toEqual([3, 3, true])
    expect([out.width, out.height]).toEqual([360, 120])
  })
})

describe("integration", () => {
  it("hit-tests anywhere inside, bounds are the rectangle, binds as a rectangle", () => {
    const t = table({ x: 0, y: 0 })
    expect(hitTestElement(t, { x: 50, y: 50 })).toBe(true)
    expect(hitTestElement(t, { x: 400, y: 50 })).toBe(false)
    expect(getElementBounds(t)).toEqual({ x: 0, y: 0, width: 360, height: 120 })
    expect(canBindTo(t)).toBe(true)
  })
  it("stats expose rows x cols", () => {
    const t = table()
    expect(computeStats([t], [t])).toMatchObject({ kind: "single", table: { rows: 3, cols: 3 } })
  })
  it("tableText joins all cells for search", () => {
    const t = setCellText(setCellText(table(), 0, 0, "alpha"), 2, 1, "omega")
    expect(tableText(t)).toContain("alpha")
    expect(tableText(t)).toContain("omega")
  })
})
