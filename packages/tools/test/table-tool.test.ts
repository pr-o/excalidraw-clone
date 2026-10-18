import {
  Scene,
  newTable,
  newRectangle,
  type ExcalidrawElement,
  type ExcalidrawTableElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { TOOLS, findHandleAt, selectionTool, tableTool } from "../src"
import type { ToolEffect } from "../src"
import { NO_MODIFIERS, IDENTITY_VIEW, makeCtx, point, withModifiers } from "./test-utils"

/** Run a gesture's effects through a real Scene so reconcile applies. */
const run = (scene: Scene, effects: readonly ToolEffect[]): void => {
  for (const eff of effects) {
    if (eff.kind === "mutation")
      scene.mutate(eff.apply, eff.skipHistory ? { skipHistory: true } : {})
  }
}

const draw = (down: [number, number], up: [number, number], mods = NO_MODIFIERS) => {
  const scene = new Scene()
  const ctx = makeCtx({ modifiers: mods })
  let [state, fx] = tableTool.reduce(
    tableTool.initial,
    { type: "pointerDown", at: point(...down) },
    ctx,
  )
  run(scene, fx)
  ;[state, fx] = tableTool.reduce(state, { type: "pointerMove", at: point(...up) }, ctx)
  run(scene, fx)
  const final = tableTool.reduce(state, { type: "pointerUp", at: point(...up) }, ctx)
  run(scene, final[1])
  return {
    scene,
    effects: final[1],
    table: scene.getElements()[0] as ExcalidrawTableElement | undefined,
  }
}

describe("table tool", () => {
  it("is registered", () => {
    expect(TOOLS.table).toBe(tableTool)
  })

  it("drag splits the box evenly into 3x3", () => {
    const { table, effects } = draw([10, 20], [310, 170])
    expect(table).toMatchObject({ type: "table", x: 10, y: 20, width: 300, height: 150 })
    expect(table!.colWidths).toEqual([100, 100, 100])
    expect(table!.rowHeights).toEqual([50, 50, 50])
    expect(effects.some((e) => e.kind === "select")).toBe(true)
    expect(effects.some((e) => e.kind === "switchTool")).toBe(true)
  })

  it("a plain click drops the default 360x120 table", () => {
    const { table } = draw([50, 60], [50, 60])
    expect(table).toMatchObject({ x: 50, y: 60, width: 360, height: 120 })
  })

  it("a tiny drag grows to the minimum size", () => {
    const { table } = draw([0, 0], [30, 20])
    expect([table!.width, table!.height]).toEqual([120, 84])
  })

  it("dragging up-left anchors at the press point", () => {
    const { table } = draw([300, 300], [100, 150])
    expect(table).toMatchObject({ x: 100, y: 150, width: 200, height: 150 })
  })

  it("Escape removes the in-progress table", () => {
    const scene = new Scene()
    const ctx = makeCtx()
    let [state, fx] = tableTool.reduce(
      tableTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      ctx,
    )
    run(scene, fx)
    ;[state, fx] = tableTool.reduce(state, { type: "escape" }, ctx)
    run(scene, fx)
    expect(scene.getElements()).toHaveLength(0)
    expect(state.phase).toBe("idle")
  })

  it("ignores shift (no square constraint)", () => {
    const { table } = draw([0, 0], [300, 150], withModifiers({ shift: true }))
    expect([table!.width, table!.height]).toEqual([300, 150])
  })
})

describe("selection — table", () => {
  const table = { ...newTable({ x: 100, y: 100 }), id: "T" }
  const els: ExcalidrawElement[] = [table]
  const ctx = (extra = {}) =>
    makeCtx({ readElements: () => els, hitTest: () => table, selectedIds: ["T"], ...extra })

  it("double-click starts editing the clicked cell", () => {
    const [, fx] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(100 + 130, 100 + 50) },
      ctx(),
    )
    expect(fx).toContainEqual({ kind: "startTextEdit", elementId: "T", cell: { row: 1, col: 1 } })
    expect(fx).toContainEqual({ kind: "select", ids: ["T"] })
  })

  it("finds a column border handle only on the selected table", () => {
    const hit = findHandleAt(point(100 + 120 + 2, 100 + 60), ["T"], els, IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "tableBorder", elementId: "T", axis: "col", index: 0 })
    expect(findHandleAt(point(100 + 120, 100 + 60), [], els, IDENTITY_VIEW)).toBeNull()
    // tolerance shrinks with zoom: 4 screen px at zoom 4 is 1 scene px
    const zoomed = { scrollX: 0, scrollY: 0, zoom: 4 }
    expect(findHandleAt(point(100 + 120 + 3, 100 + 60), ["T"], els, zoomed)).toBeNull()
  })

  it("a corner resize handle wins over a border", () => {
    const hit = findHandleAt(point(100, 100), ["T"], els, IDENTITY_VIEW)
    expect(hit?.kind).toBe("resize")
  })

  it("dragging a column border resizes that column and the table width", () => {
    const scene = new Scene([table])
    const c = makeCtx({
      readElements: () => scene.getElements(),
      hitTest: () => table,
      selectedIds: ["T"],
    })
    let [state, fx] = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(221, 160) },
      c,
    )
    expect(state.phase).toBe("tableResizing")
    ;[state, fx] = selectionTool.reduce(state, { type: "pointerMove", at: point(261, 160) }, c)
    run(scene, fx)
    const mid = scene.getElements()[0] as ExcalidrawTableElement
    expect(mid.colWidths).toEqual([160, 120, 120])
    expect(mid.width).toBe(400)
    ;[state, fx] = selectionTool.reduce(state, { type: "pointerUp", at: point(261, 160) }, c)
    run(scene, fx)
    expect(state.phase).toBe("idle")
    expect(scene.canUndo()).toBe(true)
    scene.undo()
    expect((scene.getElements()[0] as ExcalidrawTableElement).colWidths).toEqual([120, 120, 120])
  })

  it("dragging a row border resizes that row; Escape restores", () => {
    const scene = new Scene([table])
    const c = makeCtx({
      readElements: () => scene.getElements(),
      hitTest: () => table,
      selectedIds: ["T"],
    })
    let [state, fx] = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(150, 141) },
      c,
    )
    expect(state).toMatchObject({ phase: "tableResizing", axis: "row", index: 0 })
    ;[state, fx] = selectionTool.reduce(state, { type: "pointerMove", at: point(150, 171) }, c)
    run(scene, fx)
    expect((scene.getElements()[0] as ExcalidrawTableElement).rowHeights).toEqual([70, 40, 40])
    ;[state, fx] = selectionTool.reduce(state, { type: "escape" }, c)
    run(scene, fx)
    expect((scene.getElements()[0] as ExcalidrawTableElement).rowHeights).toEqual([40, 40, 40])
  })

  it("an unselected table is dragged like any element (no border grab)", () => {
    const r = newRectangle({ x: 0, y: 0, width: 5, height: 5 })
    const [state] = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(221, 160) },
      makeCtx({ readElements: () => [table, r], hitTest: () => table, selectedIds: [] }),
    )
    expect(state.phase).toBe("dragging")
  })
})
