import { describe, expect, it } from "vitest"
import {
  DEFAULT_BG_COLOR,
  DEFAULT_FILL_STYLE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_OPACITY,
  DEFAULT_ROUGHNESS,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  newArrow,
  newDiamond,
  newEllipse,
  newFrame,
  newFreedraw,
  newHexagon,
  newImage,
  newLine,
  newParallelogram,
  newRectangle,
  newText,
  newTriangle,
} from "../src"

describe("baseElement defaults via newRectangle", () => {
  it("populates id and applies all base defaults", () => {
    const r = newRectangle({ x: 1, y: 2, width: 30, height: 40 })
    expect(r.id).toBeTruthy()
    expect(r.id.length).toBeGreaterThan(0)
    expect(r.type).toBe("rectangle")
    expect(r.x).toBe(1)
    expect(r.y).toBe(2)
    expect(r.width).toBe(30)
    expect(r.height).toBe(40)
    expect(r.angle).toBe(0)
    expect(r.strokeColor).toBe(DEFAULT_STROKE_COLOR)
    expect(r.backgroundColor).toBe(DEFAULT_BG_COLOR)
    expect(r.fillStyle).toBe(DEFAULT_FILL_STYLE)
    expect(r.strokeWidth).toBe(DEFAULT_STROKE_WIDTH)
    expect(r.strokeStyle).toBe(DEFAULT_STROKE_STYLE)
    expect(r.roughness).toBe(DEFAULT_ROUGHNESS)
    expect(r.opacity).toBe(DEFAULT_OPACITY)
    expect(r.groupIds).toEqual([])
    expect(r.frameId).toBeNull()
    expect(r.roundness).toBeNull()
    expect(Number.isInteger(r.seed)).toBe(true)
    expect(Number.isInteger(r.versionNonce)).toBe(true)
    expect(r.isDeleted).toBe(false)
    expect(r.boundElements).toBeNull()
    expect(r.link).toBeNull()
    expect(r.locked).toBe(false)
  })

  it("applies width/height defaults of 0 when omitted", () => {
    const r = newRectangle({ x: 0, y: 0 })
    expect(r.width).toBe(0)
    expect(r.height).toBe(0)
  })

  it("override beats default", () => {
    const r = newRectangle({
      x: 0,
      y: 0,
      strokeColor: "#ff0000",
      backgroundColor: "#00ff00",
      angle: Math.PI,
    })
    expect(r.strokeColor).toBe("#ff0000")
    expect(r.backgroundColor).toBe("#00ff00")
    expect(r.angle).toBe(Math.PI)
  })

  it("two consecutive calls produce different ids", () => {
    const a = newRectangle({ x: 0, y: 0 })
    const b = newRectangle({ x: 0, y: 0 })
    expect(a.id).not.toBe(b.id)
  })
})

describe("shape factories", () => {
  it("newDiamond returns diamond type", () => {
    expect(newDiamond({ x: 0, y: 0 }).type).toBe("diamond")
  })

  it("newEllipse returns ellipse type", () => {
    expect(newEllipse({ x: 0, y: 0 }).type).toBe("ellipse")
  })
})

describe("linear factories", () => {
  it("newLine starts with empty points and null bindings/arrowheads", () => {
    const l = newLine({ x: 0, y: 0 })
    expect(l.type).toBe("line")
    expect(l.points).toEqual([])
    expect(l.lastCommittedPoint).toBeNull()
    expect(l.startBinding).toBeNull()
    expect(l.endBinding).toBeNull()
    expect(l.startArrowhead).toBeNull()
    expect(l.endArrowhead).toBeNull()
  })

  it("newArrow starts with empty points and arrow endArrowhead", () => {
    const a = newArrow({ x: 0, y: 0 })
    expect(a.type).toBe("arrow")
    expect(a.points).toEqual([])
    expect(a.lastCommittedPoint).toBeNull()
    expect(a.startArrowhead).toBeNull()
    expect(a.endArrowhead).toBe("arrow")
  })
})

describe("freedraw factory", () => {
  it("starts with empty points/pressures and simulatePressure true", () => {
    const f = newFreedraw({ x: 0, y: 0 })
    expect(f.type).toBe("freedraw")
    expect(f.points).toEqual([])
    expect(f.pressures).toEqual([])
    expect(f.simulatePressure).toBe(true)
    expect(f.lastCommittedPoint).toBeNull()
  })
})

describe("text factory", () => {
  it("applies text defaults and originalText mirrors text", () => {
    const t = newText({ x: 0, y: 0 })
    expect(t.type).toBe("text")
    expect(t.text).toBe("")
    expect(t.fontSize).toBe(DEFAULT_FONT_SIZE)
    expect(t.fontFamily).toBe(DEFAULT_FONT_FAMILY)
    expect(t.textAlign).toBe("left")
    expect(t.verticalAlign).toBe("top")
    expect(t.containerId).toBeNull()
    expect(t.originalText).toBe("")
    expect(t.autoResize).toBe(true)
    expect(t.lineHeight).toBeGreaterThan(0)
  })

  it("text overrides flow into originalText", () => {
    const t = newText({ x: 0, y: 0, text: "hello", fontSize: 32, textAlign: "center" })
    expect(t.text).toBe("hello")
    expect(t.originalText).toBe("hello")
    expect(t.fontSize).toBe(32)
    expect(t.textAlign).toBe("center")
  })
})

describe("image factory", () => {
  it("defaults: fileId null, status pending, scale [1,1], crop null", () => {
    const img = newImage({ x: 0, y: 0 })
    expect(img.type).toBe("image")
    expect(img.fileId).toBeNull()
    expect(img.status).toBe("pending")
    expect(img.scale).toEqual([1, 1])
    expect(img.crop).toBeNull()
  })

  it("accepts fileId override", () => {
    const img = newImage({ x: 0, y: 0, fileId: "f1" })
    expect(img.fileId).toBe("f1")
  })
})

describe("frame factory", () => {
  it("defaults: name null, isCollapsed false", () => {
    const f = newFrame({ x: 0, y: 0 })
    expect(f.type).toBe("frame")
    expect(f.name).toBeNull()
    expect(f.isCollapsed).toBe(false)
  })

  it("accepts name override", () => {
    const f = newFrame({ x: 0, y: 0, name: "Group A" })
    expect(f.name).toBe("Group A")
  })
})

import { newNote } from "../src/factories"

describe("newNote", () => {
  it("creates a rounded yellow container bound to a centered text child", () => {
    const { container, text } = newNote({ x: 10, y: 20, width: 60, height: 40 })
    expect(container.type).toBe("rectangle")
    expect(container.backgroundColor).toBe("#ffec99")
    expect(container.roundness).toEqual({ type: 1 })
    expect(container.boundElements).toEqual([{ id: text.id, type: "text" }])
    expect(text.type).toBe("text")
    expect(text.containerId).toBe(container.id)
    expect(text.textAlign).toBe("center")
    expect(text.verticalAlign).toBe("middle")
  })
})

describe("flowchart shape factories", () => {
  it("newTriangle/newParallelogram/newHexagon create their types with base defaults", () => {
    const t = newTriangle({ x: 1, y: 2, width: 30, height: 40 })
    const p = newParallelogram({ x: 0, y: 0 })
    const h = newHexagon({ x: 0, y: 0 })
    expect(t.type).toBe("triangle")
    expect(p.type).toBe("parallelogram")
    expect(h.type).toBe("hexagon")
    expect(t.width).toBe(30)
    expect(t.locked).toBe(false)
    expect(h.roundness).toBeNull()
  })
})
