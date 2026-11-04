import { newRectangle, type ExcalidrawData, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { mergeDocuments } from "../src/driver/mergeDocuments"

const rect = (id: string, x = 0): ExcalidrawElement => ({
  ...newRectangle({ x, y: 0, width: 10, height: 10 }),
  id,
})
const doc = (
  pages: { id: string; name?: string; elements: ExcalidrawElement[] }[],
  activePageId = pages[0]?.id ?? "p",
): ExcalidrawData => ({
  type: "excalidraw",
  version: 3,
  source: "test",
  activePageId,
  pages: pages.map((p) => ({ id: p.id, name: p.name ?? p.id, elements: p.elements })),
})
const ids = (d: ExcalidrawData, page = 0): string[] => d.pages[page]!.elements.map((e) => e.id)

describe("mergeDocuments", () => {
  const a = rect("a")
  const base = doc([{ id: "p", elements: [a] }])

  it("keeps elements added on both sides", () => {
    const local = doc([{ id: "p", elements: [a, rect("mine")] }])
    const remote = doc([{ id: "p", elements: [a, rect("theirs")] }])
    expect(ids(mergeDocuments(base, local, remote))).toEqual(["a", "theirs", "mine"])
  })

  it("takes each side's edit to a different element", () => {
    const b0 = rect("b")
    const base2 = doc([{ id: "p", elements: [a, b0] }])
    const local = doc([{ id: "p", elements: [{ ...a, x: 50 }, b0] }])
    const remote = doc([{ id: "p", elements: [a, { ...b0, x: 99 }] }])
    const merged = mergeDocuments(base2, local, remote).pages[0]!.elements
    expect(merged.map((e) => e.x)).toEqual([50, 99])
  })

  it("lets this tab win when both changed the same element", () => {
    const local = doc([{ id: "p", elements: [{ ...a, x: 1 }] }])
    const remote = doc([{ id: "p", elements: [{ ...a, x: 2 }] }])
    expect(mergeDocuments(base, local, remote).pages[0]!.elements[0]!.x).toBe(1)
  })

  it("keeps a deletion made by the other tab when this tab did not touch the element", () => {
    const local = doc([{ id: "p", elements: [a, rect("mine")] }])
    const remote = doc([{ id: "p", elements: [{ ...a, isDeleted: true }] }])
    const merged = mergeDocuments(base, local, remote).pages[0]!.elements
    expect(merged.find((e) => e.id === "a")!.isDeleted).toBe(true)
    expect(merged.map((e) => e.id)).toContain("mine")
  })

  it("merges pages: new pages from both sides, renames, and stays on this tab's page", () => {
    const local = doc(
      [
        { id: "p", name: "Renamed here", elements: [a] },
        { id: "q", elements: [] },
      ],
      "q",
    )
    const remote = doc([
      { id: "p", elements: [a] },
      { id: "r", elements: [rect("r1")] },
    ])
    const merged = mergeDocuments(base, local, remote)
    expect(merged.pages.map((p) => p.id)).toEqual(["p", "r", "q"])
    expect(merged.pages[0]!.name).toBe("Renamed here")
    expect(merged.activePageId).toBe("q")
  })

  it("drops a page the other tab deleted unless this tab edited it", () => {
    const base2 = doc([
      { id: "p", elements: [a] },
      { id: "gone", elements: [] },
      { id: "kept", elements: [] },
    ])
    const local = doc([
      { id: "p", elements: [a] },
      { id: "gone", elements: [] },
      { id: "kept", elements: [rect("edited")] },
    ])
    const remote = doc([{ id: "p", elements: [a] }])
    expect(mergeDocuments(base2, local, remote).pages.map((p) => p.id)).toEqual(["p", "kept"])
  })
})
