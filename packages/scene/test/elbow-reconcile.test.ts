import { describe, expect, it } from "vitest"
import {
  BINDING_GAP,
  newArrow,
  newRectangle,
  Scene,
  type ExcalidrawArrowElement,
  type ExcalidrawElement,
} from "../src"

const orthogonal = (pts: readonly { x: number; y: number }[]): boolean => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (a.x !== b.x && a.y !== b.y) return false
  }
  return true
}

const boundElbow = () => {
  const a = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
  const b = newRectangle({ x: 300, y: 200, width: 100, height: 100 })
  const arrow: ExcalidrawElement = {
    ...newArrow({ x: 100, y: 50, elbowed: true }),
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 200 },
    ],
    startBinding: { elementId: a.id, focus: 0, gap: BINDING_GAP },
    endBinding: { elementId: b.id, focus: 0, gap: BINDING_GAP },
  }
  return { a, b, arrow }
}

describe("reconcileBindings — elbowed arrows", () => {
  it("snaps endpoints to side centers and routes orthogonally", () => {
    const { a, b, arrow } = boundElbow()
    const scene = new Scene([a, b, arrow])
    scene.mutate(() => undefined)
    const out = scene.getElements().find((e) => e.type === "arrow") as ExcalidrawArrowElement
    const abs = out.points.map((p) => ({ x: out.x + p.x, y: out.y + p.y }))
    expect(orthogonal(abs)).toBe(true)
    // A center (50,50) → B center (350,250): dominant x → exit "right" at (104,50)
    expect(abs[0]).toEqual({ x: 100 + BINDING_GAP, y: 50 })
    // B exits "left" at (300-gap, 250)
    expect(abs[abs.length - 1]).toEqual({ x: 300 - BINDING_GAP, y: 250 })
  })

  it("re-routes when a bound shape moves", () => {
    const { a, b, arrow } = boundElbow()
    const scene = new Scene([a, b, arrow])
    scene.mutate(() => undefined)
    scene.mutate((draft) => {
      const i = draft.findIndex((e) => e.id === b.id)
      draft[i] = { ...draft[i]!, x: 0, y: 300 } // B now below A
    })
    const out = scene.getElements().find((e) => e.type === "arrow") as ExcalidrawArrowElement
    const abs = out.points.map((p) => ({ x: out.x + p.x, y: out.y + p.y }))
    expect(orthogonal(abs)).toBe(true)
    // A center (50,50) → B center (50,350): dominant y → exit "bottom"
    expect(abs[0]).toEqual({ x: 50, y: 100 + BINDING_GAP })
    expect(abs[abs.length - 1]).toEqual({ x: 50, y: 300 - BINDING_GAP })
  })

  it("drops manual bends: interior points are fully derived", () => {
    const { a, b, arrow } = boundElbow()
    const bent = {
      ...arrow,
      points: [
        { x: 0, y: 0 },
        { x: 77, y: -333 },
        { x: 200, y: 200 },
      ],
    }
    const scene = new Scene([a, b, bent])
    scene.mutate(() => undefined)
    const out = scene.getElements().find((e) => e.type === "arrow") as ExcalidrawArrowElement
    const abs = out.points.map((p) => ({ x: out.x + p.x, y: out.y + p.y }))
    expect(orthogonal(abs)).toBe(true)
    expect(abs.some((p) => p.y < 0)).toBe(false)
  })

  it("routes unbound elbowed arrows orthogonally too", () => {
    const arrow: ExcalidrawElement = {
      ...newArrow({ x: 0, y: 0, elbowed: true }),
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 80 },
      ],
    }
    const scene = new Scene([arrow])
    scene.mutate(() => undefined)
    const out = scene.getElements().find((e) => e.type === "arrow") as ExcalidrawArrowElement
    expect(orthogonal(out.points)).toBe(true)
    expect(out.points.length).toBeGreaterThan(2)
  })

  it("is reference-stable when nothing changed and leaves sharp arrows alone", () => {
    const { a, b, arrow } = boundElbow()
    const sharp = {
      ...newArrow({ x: 0, y: 150 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 37 },
      ],
    }
    const scene = new Scene([a, b, arrow, sharp])
    scene.mutate(() => undefined)
    const routedOnce = scene
      .getElements()
      .find((e) => e.type === "arrow" && e.elbowed) as ExcalidrawArrowElement
    const sharpOnce = scene
      .getElements()
      .find((e) => e.type === "arrow" && !e.elbowed) as ExcalidrawArrowElement
    scene.mutate(() => undefined)
    expect(scene.getElements().find((e) => e.type === "arrow" && e.elbowed)).toBe(routedOnce)
    expect(scene.getElements().find((e) => e.type === "arrow" && !e.elbowed)).toBe(sharpOnce)
    expect(sharpOnce.points[1]).toEqual({ x: 50, y: 37 })
  })
})
