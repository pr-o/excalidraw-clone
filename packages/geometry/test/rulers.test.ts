import { describe, expect, it } from "vitest"
import { hitTestUserGuide, rulerTicks, rulerTickStep } from "../src/rulers"

describe("rulerTickStep", () => {
  it("picks a 1/2/5 x 10^n step whose screen spacing is at least 50px", () => {
    expect(rulerTickStep(1)).toBe(50)
    expect(rulerTickStep(2)).toBe(50)
    expect(rulerTickStep(0.5)).toBe(100)
    expect(rulerTickStep(0.3)).toBe(200)
    expect(rulerTickStep(0.1)).toBe(500)
    expect(rulerTickStep(10)).toBe(5)
    expect(rulerTickStep(30)).toBe(2)
  })

  it("keeps label spacing within 50..125px across zoom levels", () => {
    for (let z = 0.1; z <= 30; z *= 1.13) {
      const px = rulerTickStep(z) * z
      expect(px).toBeGreaterThanOrEqual(50)
      expect(px).toBeLessThanOrEqual(125)
    }
  })
})

describe("rulerTicks", () => {
  it("labels scene multiples of the step at their viewport offsets", () => {
    // zoom 1, scroll 0: scene 0 sits at px 0; step 50.
    expect(rulerTicks(0, 1, 160)).toEqual([
      { px: 0, value: 0 },
      { px: 50, value: 50 },
      { px: 100, value: 100 },
      { px: 150, value: 150 },
    ])
  })

  it("follows pan and zoom", () => {
    // scroll 30 shifts scene 0 to px 60 at zoom 2; step 50 → 100px spacing.
    const ticks = rulerTicks(30, 2, 300)
    expect(ticks.map((t) => t.value)).toEqual([0, 50, 100])
    expect(ticks.map((t) => t.px)).toEqual([60, 160, 260])
  })
})

describe("hitTestUserGuide", () => {
  const guides = { x: [100], y: [200] }
  it("hits a vertical guide within 4 screen px", () => {
    expect(hitTestUserGuide(guides, { x: 103, y: 0 }, 1)).toEqual({ axis: "x", index: 0 })
  })
  it("scales tolerance by zoom", () => {
    expect(hitTestUserGuide(guides, { x: 103, y: 0 }, 2)).toBeNull()
    expect(hitTestUserGuide(guides, { x: 101.5, y: 0 }, 2)).toEqual({ axis: "x", index: 0 })
  })
  it("hits a horizontal guide", () => {
    expect(hitTestUserGuide(guides, { x: 0, y: 197 }, 1)).toEqual({ axis: "y", index: 0 })
  })
  it("misses away from every guide", () => {
    expect(hitTestUserGuide(guides, { x: 50, y: 50 }, 1)).toBeNull()
  })
})
