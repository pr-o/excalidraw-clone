import {
  newFrame,
  newLabelFor,
  newRectangle,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  exportFilename,
  hasExportableSelection,
  resolveExportTarget,
} from "../src/driver/exportTarget"
import { createPageRecord } from "../src/driver/pages"

const ids = (els: readonly ExcalidrawElement[]): string[] => els.map((e) => e.id)

const twoPages = () => {
  const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  const b = newRectangle({ x: 100, y: 100, width: 10, height: 10 })
  const c = newRectangle({ x: 500, y: 500, width: 30, height: 30 })
  const p1 = createPageRecord("Page 1", [a, b])
  const p2 = createPageRecord("Notes", [c])
  return { a, b, c, p1, p2, pages: [p1, p2] }
}

describe("resolveExportTarget — page scope", () => {
  it("exports every live element of the active page", () => {
    const { a, b, p1, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [], { pageId: p1.id, scope: "page" })
    expect(ids(out.elements)).toEqual([a.id, b.id])
    expect(out.pageName).toBe("Page 1")
    expect(out.scope).toBe("page")
  })

  it("exports a non-active page's elements, not the active page's", () => {
    const { c, p1, p2, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [], { pageId: p2.id, scope: "page" })
    expect(ids(out.elements)).toEqual([c.id])
    expect(out.pageName).toBe("Notes")
  })

  it("falls back to the active page for an unknown pageId", () => {
    const { a, b, p1, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [], { pageId: "gone", scope: "page" })
    expect(ids(out.elements)).toEqual([a.id, b.id])
    expect(out.pageName).toBe("Page 1")
  })

  it("skips deleted elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 9, y: 9, width: 1, height: 1 }), isDeleted: true }
    const p = createPageRecord("Page 1", [a, dead])
    const out = resolveExportTarget([p], p.id, [], { pageId: p.id, scope: "page" })
    expect(ids(out.elements)).toEqual([a.id])
  })
})

describe("resolveExportTarget — selection scope", () => {
  it("exports only the selected elements of the active page", () => {
    const { b, p1, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [b.id], { pageId: p1.id, scope: "selection" })
    expect(ids(out.elements)).toEqual([b.id])
    expect(out.scope).toBe("selection")
    expect(out.pageName).toBe("Page 1")
  })

  it("includes the bound label of a selected shape", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 80, height: 40 })
    const label = { ...newLabelFor(rect), text: "hi" }
    const boundRect = { ...rect, boundElements: [{ id: label.id, type: "text" as const }] }
    const other = newRectangle({ x: 300, y: 300, width: 10, height: 10 })
    const p = createPageRecord("Page 1", [boundRect, label, other])
    const out = resolveExportTarget([p], p.id, [rect.id], { pageId: p.id, scope: "selection" })
    expect(ids(out.elements)).toEqual([rect.id, label.id])
  })

  it("includes the members of a selected frame", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const member = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const outside = newRectangle({ x: 400, y: 400, width: 20, height: 20 })
    const p = createPageRecord("Page 1", [frame, member, outside])
    const out = resolveExportTarget([p], p.id, [frame.id], { pageId: p.id, scope: "selection" })
    expect(ids(out.elements).sort()).toEqual([frame.id, member.id].sort())
  })

  it("keeps scene (z) order regardless of selection order", () => {
    const { a, b, p1, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [b.id, a.id], {
      pageId: p1.id,
      scope: "selection",
    })
    expect(ids(out.elements)).toEqual([a.id, b.id])
  })

  it("ignores selection scope for a non-active page (selection is page-local)", () => {
    const { a, c, p1, p2, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [a.id], { pageId: p2.id, scope: "selection" })
    expect(ids(out.elements)).toEqual([c.id])
    expect(out.scope).toBe("page")
  })

  it("falls back to the whole page when the selection resolves to nothing", () => {
    const { a, b, p1, pages } = twoPages()
    const empty = resolveExportTarget(pages, p1.id, [], { pageId: p1.id, scope: "selection" })
    expect(ids(empty.elements)).toEqual([a.id, b.id])
    expect(empty.scope).toBe("page")
    const stale = resolveExportTarget(pages, p1.id, ["no-such-id"], {
      pageId: p1.id,
      scope: "selection",
    })
    expect(ids(stale.elements)).toEqual([a.id, b.id])
    expect(stale.scope).toBe("page")
  })

  it("returns an empty page-scoped target when there are no pages at all", () => {
    const out = resolveExportTarget([], "x", ["y"], { pageId: "x", scope: "selection" })
    expect(out).toEqual({ elements: [], pageName: "", scope: "page" })
  })
})

describe("hasExportableSelection", () => {
  it("is true when a selected id resolves to a live element", () => {
    const { a, b } = twoPages()
    expect(hasExportableSelection([a, b], [a.id])).toBe(true)
  })

  it("is false for an empty or stale selection", () => {
    const { a, b } = twoPages()
    expect(hasExportableSelection([a, b], [])).toBe(false)
    expect(hasExportableSelection([a, b], ["no-such-id"])).toBe(false)
  })
})

describe("exportFilename", () => {
  it.each([
    ["Page 1", "page", "png", "Page 1.png"],
    ["Page 1", "selection", "png", "Page 1-selection.png"],
    ["Notes", "page", "svg", "Notes.svg"],
    ["Notes", "selection", "svg", "Notes-selection.svg"],
    ["", "page", "png", "drawing.png"],
    ["   ", "page", "svg", "drawing.svg"],
    ["", "selection", "png", "drawing-selection.png"],
    ["Q3/Q4: plan", "page", "png", "Q3-Q4- plan.png"],
    ['a\\b*c?d"e<f>g|h', "page", "png", "a-b-c-d-e-f-g-h.png"],
    ["tab\there", "page", "png", "tab-here.png"],
    ["  padded  ", "page", "png", "padded.png"],
    ["회의 노트", "page", "png", "회의 노트.png"],
  ] as const)("(%j, %s, %s) → %j", (name, scope, format, expected) => {
    expect(exportFilename(name, scope, format)).toBe(expected)
  })
})
