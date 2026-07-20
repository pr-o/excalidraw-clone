import { describe, expect, it } from "vitest"
import type {
  BoundElement,
  ExcalidrawArrowElement,
  ExcalidrawData,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawElementBase,
  ExcalidrawEllipseElement,
  ExcalidrawFrameElement,
  ExcalidrawFreedrawElement,
  ExcalidrawImageElement,
  ExcalidrawLineElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
  PointBinding,
} from "../src"

const baseFields = (): Omit<ExcalidrawElementBase, "type"> => ({
  id: "id-1",
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  angle: 0,
  strokeColor: "#000",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: 1,
  versionNonce: 2,
  isDeleted: false,
  boundElements: null,
  updated: 0,
  link: null,
  locked: false,
})

describe("element type definitions", () => {
  it("rectangle assigns and narrows", () => {
    const r: ExcalidrawRectangleElement = { ...baseFields(), type: "rectangle" }
    const e: ExcalidrawElement = r
    if (e.type === "rectangle") {
      expect(e.width).toBe(30)
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("diamond assigns and narrows", () => {
    const d: ExcalidrawDiamondElement = { ...baseFields(), type: "diamond" }
    const e: ExcalidrawElement = d
    expect(e.type).toBe("diamond")
  })

  it("ellipse assigns and narrows", () => {
    const el: ExcalidrawEllipseElement = { ...baseFields(), type: "ellipse" }
    const e: ExcalidrawElement = el
    expect(e.type).toBe("ellipse")
  })

  it("line carries linear-base fields and narrows", () => {
    const l: ExcalidrawLineElement = {
      ...baseFields(),
      type: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
    }
    const e: ExcalidrawElement = l
    if (e.type === "line") {
      expect(e.points.length).toBe(2)
      expect(e.startArrowhead).toBeNull()
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("arrow carries linear-base fields and accepts arrowhead literals", () => {
    const a: ExcalidrawArrowElement = {
      ...baseFields(),
      type: "arrow",
      points: [],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "triangle",
      elbowed: false,
    }
    const e: ExcalidrawElement = a
    if (e.type === "arrow") {
      expect(e.endArrowhead).toBe("triangle")
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("freedraw carries pressures and points", () => {
    const f: ExcalidrawFreedrawElement = {
      ...baseFields(),
      type: "freedraw",
      points: [{ x: 0, y: 0 }],
      pressures: [0.5],
      simulatePressure: false,
      lastCommittedPoint: null,
    }
    const e: ExcalidrawElement = f
    if (e.type === "freedraw") {
      expect(e.pressures.length).toBe(1)
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("text carries typography fields", () => {
    const t: ExcalidrawTextElement = {
      ...baseFields(),
      type: "text",
      text: "hi",
      fontSize: 20,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      originalText: "hi",
      autoResize: true,
      lineHeight: 1.25,
      baseline: 16,
    }
    const e: ExcalidrawElement = t
    if (e.type === "text") {
      expect(e.fontSize).toBe(20)
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("image carries fileId and scale tuple", () => {
    const img: ExcalidrawImageElement = {
      ...baseFields(),
      type: "image",
      fileId: null,
      status: "pending",
      scale: [1, 1],
      crop: null,
    }
    const e: ExcalidrawElement = img
    if (e.type === "image") {
      expect(e.scale).toEqual([1, 1])
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("frame carries name and isCollapsed", () => {
    const fr: ExcalidrawFrameElement = {
      ...baseFields(),
      type: "frame",
      name: null,
      isCollapsed: false,
    }
    const e: ExcalidrawElement = fr
    if (e.type === "frame") {
      expect(e.isCollapsed).toBe(false)
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("PointBinding and BoundElement compile with required fields", () => {
    const pb: PointBinding = { elementId: "x", focus: 0, gap: 0 }
    const be: BoundElement = { id: "y", type: "arrow" }
    expect(pb.elementId).toBe("x")
    expect(be.type).toBe("arrow")
  })

  it("ExcalidrawData literal with empty elements is valid", () => {
    const d: ExcalidrawData = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [],
    }
    expect(d.elements.length).toBe(0)
  })

  it("ExcalidrawData accepts optional appState and files", () => {
    const d: ExcalidrawData = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [],
      appState: { zoom: 1 },
      files: {
        "file-1": {
          id: "file-1",
          mimeType: "image/png",
          dataURL: "data:image/png;base64,AAAA",
          created: 0,
        },
      },
    }
    expect(d.files?.["file-1"]?.mimeType).toBe("image/png")
  })
})
