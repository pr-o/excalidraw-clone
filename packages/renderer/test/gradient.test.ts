import { Scene, newEllipse, newLine, newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { describe, expect, it, vi } from "vitest"
import { drawElement } from "../src/draw-element"
import { ShapeCache } from "../src/shape-cache"
import { renderToSVG } from "../src/svg"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const gradientRect = (patch: Partial<ExcalidrawElement> = {}): ExcalidrawElement =>
  ({
    ...newRectangle({ x: 10, y: 20, width: 200, height: 100 }),
    backgroundColor: "#ffc9c9",
    fillStyle: "solid",
    gradient: { to: "#a5d8ff", angle: 0 },
    ...patch,
  }) as ExcalidrawElement

const draw = (el: ExcalidrawElement, theme: "light" | "dark" = "light") => {
  const { canvas, ctx } = createMockCanvas()
  const stops: [number, string][] = []
  const create = vi.fn(() => ({ addColorStop: (o: number, c: string) => stops.push([o, c]) }))
  ctx.createLinearGradient = create
  drawElement(
    ctx as unknown as CanvasRenderingContext2D,
    el,
    new RoughCanvas(canvas),
    new ShapeCache(),
    () => undefined,
    theme,
  )
  return { create, stops, ctx }
}

const endpoints = (create: ReturnType<typeof vi.fn>): number[] =>
  (create.mock.calls[0] as number[]).map((n) => Math.round(n * 1000) / 1000)

describe("gradient fill (canvas)", () => {
  it("angle 0 runs left to right across the local bounding box", () => {
    const { create, stops } = draw(gradientRect())
    expect(create).toHaveBeenCalledTimes(1)
    expect(endpoints(create)).toEqual([0, 50, 200, 50])
    expect(stops).toEqual([
      [0, "#ffc9c9"],
      [1, "#a5d8ff"],
    ])
  })

  it("angle 90 runs top to bottom", () => {
    const { create } = draw(gradientRect({ gradient: { to: "#a5d8ff", angle: 90 } }))
    expect(endpoints(create)).toEqual([100, 0, 100, 100])
  })

  it("fills the rough fill path with the gradient object", () => {
    const { ctx, create } = draw(gradientRect())
    const grad: unknown = create.mock.results[0]?.value
    expect(ctx.__calls.some((c) => c.method === "set:fillStyle" && c.args[0] === grad)).toBe(true)
  })

  it("applies to ellipses too", () => {
    const el = { ...gradientRect(), ...newEllipse({ x: 0, y: 0, width: 200, height: 100 }) }
    const { create } = draw({
      ...el,
      backgroundColor: "#ffc9c9",
      fillStyle: "solid",
      gradient: { to: "#a5d8ff", angle: 0 },
    })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["fillStyle is not solid", { fillStyle: "hachure" }],
    ["background is transparent", { backgroundColor: "transparent" }],
  ] as const)("is ignored when %s", (_, patch) => {
    const { create } = draw(gradientRect(patch))
    expect(create).not.toHaveBeenCalled()
  })

  it("is ignored on non-shape elements", () => {
    const line = {
      ...newLine({ x: 0, y: 0, width: 50, height: 50 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ],
      backgroundColor: "#ffc9c9",
      fillStyle: "solid",
      gradient: { to: "#a5d8ff", angle: 0 },
    } as ExcalidrawElement
    expect(draw(line).create).not.toHaveBeenCalled()
  })

  it("maps both stops through the dark theme", () => {
    const { stops } = draw(gradientRect(), "dark")
    expect(stops[0]?.[1]).not.toBe("#ffc9c9")
    expect(stops[1]?.[1]).not.toBe("#a5d8ff")
  })
})

describe("gradient fill (SVG)", () => {
  it("emits a linearGradient per element and references it as fill", () => {
    const a = gradientRect({ gradient: { to: "#a5d8ff", angle: 90 } })
    const b = gradientRect({ x: 300 })
    const svg = renderToSVG(new Scene([a, b]), { measure: () => ({ width: 0, height: 0 }) })
    expect(svg).toContain(`<linearGradient id="gradient-${a.id}"`)
    expect(svg).toContain(`<linearGradient id="gradient-${b.id}"`)
    expect(svg).toContain(`fill="url(#gradient-${a.id})"`)
    expect(svg).toMatch(/x1="100" y1="0" x2="100" y2="100"/)
    expect(svg).toContain('stop-color="#ffc9c9"')
    expect(svg).toContain('stop-color="#a5d8ff"')
  })

  it("emits no gradient for hachure fills", () => {
    const svg = renderToSVG(new Scene([gradientRect({ fillStyle: "hachure" })]), {
      measure: () => ({ width: 0, height: 0 }),
    })
    expect(svg).not.toContain("linearGradient")
  })
})
