import { describe, expect, it } from "vitest"
import { newPage, newRectangle } from "../src"

describe("newPage", () => {
  it("creates a page with a generated id, the given name, and empty elements by default", () => {
    const page = newPage("Page 1")
    expect(typeof page.id).toBe("string")
    expect(page.id.length).toBeGreaterThan(0)
    expect(page.name).toBe("Page 1")
    expect(page.elements).toEqual([])
  })

  it("accepts initial elements", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const page = newPage("Page 1", [r])
    expect(page.elements).toEqual([r])
  })

  it("generates unique ids across calls", () => {
    const a = newPage("A")
    const b = newPage("B")
    expect(a.id).not.toBe(b.id)
  })
})
