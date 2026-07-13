import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { resolveColor, themedElement } from "../src/theme-colors"

const lightness = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255
}

describe("resolveColor", () => {
  it("is identity in light theme", () => {
    expect(resolveColor("#1e1e1e", "light")).toBe("#1e1e1e")
  })

  it("passes transparent through in dark theme", () => {
    expect(resolveColor("transparent", "dark")).toBe("transparent")
  })

  it("returns unparseable input unchanged and does not throw", () => {
    expect(resolveColor("not-a-color", "dark")).toBe("not-a-color")
    expect(resolveColor("", "dark")).toBe("")
    expect(resolveColor("#12", "dark")).toBe("#12")
  })

  it("maps the design endpoints exactly", () => {
    // Pinned by the spec: default ink ↔ near-white, white ↔ default ink.
    expect(resolveColor("#1e1e1e", "dark")).toBe("#ececec")
    expect(resolveColor("#ffffff", "dark")).toBe("#1e1e1e")
  })

  it("maps pure black to pure white (clamped)", () => {
    expect(resolveColor("#000000", "dark")).toBe("#ffffff")
  })

  it("expands #rgb shorthand", () => {
    expect(resolveColor("#fff", "dark")).toBe("#1e1e1e")
  })

  it("preserves alpha in #rrggbbaa", () => {
    expect(resolveColor("#1e1e1e80", "dark")).toBe("#ececec80")
  })

  it("inverts lightness monotonically for grays at or above ink level", () => {
    let prev = Infinity
    for (let v = 0x1e; v <= 0xff; v += 0x0b) {
      const c = `#${v.toString(16).padStart(2, "0").repeat(3)}`
      const out = lightness(resolveColor(c, "dark"))
      expect(out).toBeLessThan(prev)
      prev = out
    }
  })

  it("preserves hue: pure red stays red-dominant, just lighter", () => {
    const out = resolveColor("#ff0000", "dark")
    const r = parseInt(out.slice(1, 3), 16)
    const g = parseInt(out.slice(3, 5), 16)
    const b = parseInt(out.slice(5, 7), 16)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
    expect(g).toBe(b) // hue 0 keeps green == blue
  })

  it("memoizes: repeated calls return equal results", () => {
    expect(resolveColor("#e03131", "dark")).toBe(resolveColor("#e03131", "dark"))
  })
})

describe("themedElement", () => {
  it("returns the same object in light theme", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(themedElement(el, "light")).toBe(el)
  })

  it("resolves strokeColor and backgroundColor in dark theme without mutating", () => {
    const el = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    }
    const themed = themedElement(el, "dark")
    expect(themed).not.toBe(el)
    expect(themed.strokeColor).toBe("#ececec")
    expect(themed.backgroundColor).toBe("transparent")
    expect(el.strokeColor).toBe("#1e1e1e") // original untouched
  })
})
