import { Scene } from "@excalidraw-clone/scene"
import { beforeEach, describe, expect, it } from "vitest"
import { duplicatePage, pagesFromDocument } from "../src/driver/pages"
import { dragGuideTo, guideValueAt } from "../src/driver/userGuides"
import { useAppStore } from "../src/store"

describe("dragGuideTo", () => {
  const g = { x: [10, 20], y: [5] }

  it("places a new guide on first move into the canvas", () => {
    expect(dragGuideTo(g, { axis: "y", index: -1 }, 40)).toEqual({
      guides: { x: [10, 20], y: [5, 40] },
      drag: { axis: "y", index: 1 },
    })
  })

  it("moves an existing guide", () => {
    expect(dragGuideTo(g, { axis: "x", index: 1 }, 25).guides).toEqual({ x: [10, 25], y: [5] })
  })

  it("removes the guide when dragged back over its ruler (value null)", () => {
    expect(dragGuideTo(g, { axis: "x", index: 0 }, null)).toEqual({
      guides: { x: [20], y: [5] },
      drag: { axis: "x", index: -1 },
    })
  })

  it("is a no-op for an unplaced guide still over the ruler", () => {
    const r = dragGuideTo(g, { axis: "y", index: -1 }, null)
    expect(r.guides).toBe(g)
  })
})

describe("page guides", () => {
  it("pagesFromDocument seeds each Scene with the page's guides, defaulting to none", () => {
    const { pages } = pagesFromDocument({
      type: "excalidraw",
      version: 3,
      source: "x",
      activePageId: "a",
      pages: [
        { id: "a", name: "A", elements: [], guides: { x: [1], y: [2] } },
        { id: "b", name: "B", elements: [] },
      ],
    })
    expect(pages[0]!.scene.getGuides()).toEqual({ x: [1], y: [2] })
    expect(pages[1]!.scene.getGuides()).toEqual({ x: [], y: [] })
  })

  it("duplicatePage copies guides", () => {
    const page = {
      id: "a",
      name: "A",
      scene: new Scene([], { x: [7], y: [] }),
      viewport: { scrollX: 0, scrollY: 0, zoom: 1 },
    }
    const [, copy] = duplicatePage([page], "a")
    expect(copy!.scene.getGuides()).toEqual({ x: [7], y: [] })
  })
})

describe("rulers slice", () => {
  beforeEach(() => {
    if (useAppStore.getState().rulersVisible) useAppStore.getState().toggleRulers()
  })
  it("defaults hidden and toggles", () => {
    expect(useAppStore.getState().rulersVisible).toBe(false)
    useAppStore.getState().toggleRulers()
    expect(useAppStore.getState().rulersVisible).toBe(true)
  })
})

describe("guideValueAt", () => {
  const view = { scrollX: 10, scrollY: 0, zoom: 2 }
  it("maps a viewport point to the scene coordinate on the guide's axis", () => {
    expect(guideValueAt("x", { x: 100, y: 300 }, view)).toBe(40)
    expect(guideValueAt("y", { x: 5, y: 300 }, view)).toBe(150)
  })
  it("returns null over the guide's own ruler strip", () => {
    expect(guideValueAt("y", { x: 300, y: 12 }, view)).toBeNull()
    expect(guideValueAt("x", { x: 12, y: 300 }, view)).toBeNull()
  })
})
