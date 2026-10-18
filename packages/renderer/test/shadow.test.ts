import { Scene, newFrame, newRectangle, newText } from "@excalidraw-clone/scene"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { describe, expect, it } from "vitest"
import { isElementVisible } from "../src/culling"
import { drawElement } from "../src/draw-element"
import { ShapeCache } from "../src/shape-cache"
import { renderToSVG } from "../src/svg"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const shadow = { color: "#00000059", blur: 12, offsetX: 4, offsetY: -6 }
const rect = (patch: Partial<ExcalidrawElement> = {}): ExcalidrawElement =>
  ({
    ...newRectangle({ x: 10, y: 20, width: 200, height: 100 }),
    shadow,
    ...patch,
  }) as ExcalidrawElement

const draw = (el: ExcalidrawElement, zoom = 1) => {
  const { canvas, ctx } = createMockCanvas()
  drawElement(
    ctx as unknown as CanvasRenderingContext2D,
    el,
    new RoughCanvas(canvas),
    new ShapeCache(),
    () => undefined,
    "light",
    undefined,
    zoom,
  )
  return ctx
}
const sets = (ctx: ReturnType<typeof draw>, prop: string) =>
  ctx.__calls.filter((c) => c.method === `set:${prop}`).map((c) => c.args[0])

describe("drop shadow (canvas)", () => {
  it("sets shadow props before drawing and resets them before the repaint", () => {
    const ctx = draw(rect({ roughness: 2, fillStyle: "solid", backgroundColor: "#ffc9c9" }))
    expect(sets(ctx, "shadowColor")).toEqual(["#00000059", "rgba(0,0,0,0)"])
    expect(sets(ctx, "shadowBlur")).toEqual([12, 0])
    expect(sets(ctx, "shadowOffsetX")).toEqual([4, 0])
    expect(sets(ctx, "shadowOffsetY")).toEqual([-6, 0])
    const calls = ctx.__calls.map((c) => c.method)
    expect(calls.indexOf("set:shadowColor")).toBeLessThan(calls.indexOf("stroke"))
    expect(calls.indexOf("save")).toBeLessThan(calls.indexOf("set:shadowColor"))
    expect(calls.at(-1)).toBe("restore")
  })

  it("scales blur and offsets with zoom", () => {
    const ctx = draw(rect(), 2)
    expect(sets(ctx, "shadowBlur")[0]).toBe(24)
    expect(sets(ctx, "shadowOffsetX")[0]).toBe(8)
    expect(sets(ctx, "shadowOffsetY")[0]).toBe(-12)
  })

  it("is not touched without a shadow, or on frames and bound labels", () => {
    expect(sets(draw(rect({ shadow: undefined })), "shadowColor")).toEqual([])
    const frame = { ...newFrame({ x: 0, y: 0, width: 50, height: 50 }), shadow }
    expect(sets(draw(frame as ExcalidrawElement), "shadowColor")).toEqual([])
    const label = { ...newText({ x: 0, y: 0, text: "a" }), containerId: "c", shadow }
    expect(sets(draw(label as ExcalidrawElement), "shadowColor")).toEqual([])
  })

  it("applies to free text", () => {
    const t = { ...newText({ x: 0, y: 0, text: "a" }), shadow } as ExcalidrawElement
    expect(sets(draw(t), "shadowColor")).toEqual(["#00000059"])
  })
})

describe("drop shadow (culling)", () => {
  it("keeps an element whose shadow reaches into the view", () => {
    const view = { x: 0, y: 0, width: 100, height: 100 }
    const el = newRectangle({ x: -150, y: 10, width: 100, height: 20 })
    expect(isElementVisible(el, view)).toBe(false)
    expect(isElementVisible({ ...el, shadow: { ...shadow, offsetX: 60 } }, view)).toBe(true)
  })
})

describe("drop shadow (SVG)", () => {
  const svgOf = (el: ExcalidrawElement) =>
    renderToSVG(new Scene([el]), { measure: () => ({ width: 0, height: 0 }) })

  it("emits a referenced filter with an expanded region and stdDeviation = blur / 2", () => {
    const el = rect()
    const svg = svgOf(el)
    expect(svg).toContain(`<filter id="shadow-${el.id}"`)
    expect(svg).toContain(`filter="url(#shadow-${el.id})"`)
    expect(svg).toContain('filterUnits="userSpaceOnUse"')
    expect(svg).toContain('stdDeviation="6"')
    expect(svg).toContain('flood-color="#00000059"')
    // margin = 12 blur + 6 offset + 2 stroke + 8 slack = 28 around the 200x100 box
    expect(svg).toContain('x="-28" y="-28" width="256" height="156"')
  })

  it("emits nothing without a shadow", () => {
    expect(svgOf(rect({ shadow: undefined }))).not.toContain("feDropShadow")
  })

  it("grows the export bounds by the shadow extent", () => {
    const base = svgOf(rect({ shadow: undefined })).match(/viewBox="([^"]+)"/)![1]
    const grown = svgOf(rect()).match(/viewBox="([^"]+)"/)![1]
    expect(base).toBe("-10 0 240 140")
    expect(grown).toBe("-28 -18 276 176")
  })

  it("counter-rotates the offset into the element's local space", () => {
    const svg = svgOf(rect({ angle: Math.PI / 2, shadow: { ...shadow, offsetX: 10, offsetY: 0 } }))
    expect(svg).toMatch(/dx="0" dy="-10"/)
  })
})
