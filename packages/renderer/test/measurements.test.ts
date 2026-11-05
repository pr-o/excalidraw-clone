import { Scene, newArrow, newRectangle } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src"
import { formatMeasure, selectionMeasurements } from "../src/measurements"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const rect = (x: number, y: number, width = 100, height = 50) =>
  newRectangle({ x, y, width, height })

describe("selectionMeasurements", () => {
  it("is null without a selection", () => {
    expect(selectionMeasurements([rect(0, 0)], [])).toBeNull()
  })

  it("measures a single shape's own size, unrotated", () => {
    const r = { ...rect(0, 0, 120, 40), angle: Math.PI / 6 }
    const m = selectionMeasurements([r], [r.id])!
    expect([m.width, m.height]).toEqual([120, 40])
    expect(m.bounds.width).toBeGreaterThan(120) // the rotated bounding box is larger
  })

  it("measures a multi-selection by its combined box", () => {
    const a = rect(0, 0)
    const b = rect(200, 100)
    const m = selectionMeasurements([a, b], [a.id, b.id])!
    expect([m.width, m.height]).toEqual([300, 150])
  })

  it("measures to neighbours but not to arrows attached to the selection", () => {
    const a = rect(0, 0)
    const b = rect(160, 0) // 60 to the right
    const binding = { focus: 0, gap: 4 }
    const attached = {
      ...newArrow({ x: 104, y: 25 }),
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      startBinding: { elementId: a.id, ...binding },
      endBinding: null,
    }
    const m = selectionMeasurements([a, b, attached], [a.id])!
    expect(m.gaps.map((g) => [g.side, g.distance])).toEqual([["right", 60]])
  })

  it("skips deleted elements", () => {
    const a = rect(0, 0)
    const gone = { ...rect(160, 0), isDeleted: true }
    expect(selectionMeasurements([a, gone], [a.id])!.gaps).toEqual([])
  })
})

describe("formatMeasure", () => {
  it("rounds to whole units, keeping one decimal below 10", () => {
    expect(formatMeasure(40)).toBe("40")
    expect(formatMeasure(39.6)).toBe("40")
    expect(formatMeasure(2.46)).toBe("2.5")
    expect(formatMeasure(3)).toBe("3")
  })
})

describe("CanvasRenderer measurement mode", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const labels = (on: boolean) => {
    const a = rect(0, 0)
    const b = rect(160, 0)
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx } = createMockCanvas()
    const r = new CanvasRenderer(main, new Scene([a, b]), {
      overlayCanvas: overlay,
      selection: [a.id],
    })
    r.setShowMeasurements(on)
    r.start()
    vi.advanceTimersByTime(20)
    return ctx.__calls.filter((c) => c.method === "fillText").map((c) => c.args[0])
  }

  it("draws the size and the gap only when turned on", () => {
    expect(labels(false)).toEqual([])
    expect(labels(true)).toEqual(["60", "100 × 50"])
  })
})

describe("measurement labels", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("moves a short bottom gap's label beside the size label instead of on top of it", () => {
    const a = rect(0, 0)
    const below = rect(0, 80) // 30 below a: its label would land on "100 × 50"
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx } = createMockCanvas()
    const r = new CanvasRenderer(main, new Scene([a, below]), {
      overlayCanvas: overlay,
      selection: [a.id],
    })
    r.setShowMeasurements(true)
    r.start()
    vi.advanceTimersByTime(20)
    const xOf = (text: string) =>
      ctx.__calls.find((c) => c.method === "fillText" && c.args[0] === text)!.args[1] as number
    const gapX = xOf("30")
    const sizeX = xOf("100 × 50")
    expect(sizeX).toBe(50)
    expect(gapX).toBeGreaterThan(sizeX + 40)
  })
})
