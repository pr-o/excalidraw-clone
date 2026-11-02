import { describe, expect, it } from "vitest"
import { createDoubleTap } from "../src/driver/doubleTap"

const ev = (t: number, x = 100, y = 100, pointerId = 1) => ({
  pointerId,
  clientX: x,
  clientY: y,
  timeStamp: t,
})

describe("createDoubleTap", () => {
  it("reports the second of two quick nearby taps, then starts over", () => {
    const d = createDoubleTap()
    d.down(ev(0))
    expect(d.up(ev(60))).toBe(false)
    d.down(ev(150, 105, 98, 2))
    expect(d.up(ev(200, 105, 98, 2))).toBe(true)
    d.down(ev(260))
    expect(d.up(ev(300))).toBe(false)
  })

  it("ignores slow, distant or dragged taps", () => {
    const d = createDoubleTap()
    d.down(ev(0))
    d.up(ev(50))
    d.down(ev(500))
    expect(d.up(ev(550))).toBe(false) // too late
    d.down(ev(600, 300, 300))
    expect(d.up(ev(650, 300, 300))).toBe(false) // too far from the last tap
    d.down(ev(700, 300, 300))
    expect(d.up(ev(750, 340, 300))).toBe(false) // a drag, not a tap
  })
})
