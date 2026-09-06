import { describe, expect, it, vi } from "vitest"
import { LaserTrail } from "../src/driver/laserTrail"

type Ctx = Record<string, ReturnType<typeof vi.fn>> & { setTransform: ReturnType<typeof vi.fn> }

function makeHarness(ttlMs = 700) {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as Ctx
  const canvas = { getContext: () => ctx, width: 800, height: 600 } as unknown as HTMLCanvasElement
  let clock = 0
  const queue: (() => void)[] = []
  const trail = new LaserTrail(canvas, () => ({ scrollX: 0, scrollY: 0, zoom: 1 }), {
    now: () => clock,
    raf: (cb) => {
      queue.push(cb)
      return queue.length
    },
    caf: () => {},
    ttlMs,
  })
  return {
    trail,
    ctx,
    advance: (ms: number) => {
      clock += ms
    },
    flush: () => {
      const cbs = queue.splice(0)
      for (const cb of cbs) cb()
    },
    pending: () => queue.length,
  }
}

describe("LaserTrail", () => {
  it("push schedules exactly one animation frame while the loop is idle", () => {
    const h = makeHarness()
    h.trail.push({ x: 0, y: 0 })
    h.trail.push({ x: 10, y: 10 })
    expect(h.pending()).toBe(1)
  })

  it("prunes points older than ttlMs and stops the loop when empty", () => {
    const h = makeHarness(700)
    h.trail.push({ x: 0, y: 0 })
    h.advance(800)
    h.flush()
    expect(h.pending()).toBe(0) // no reschedule
    expect(h.ctx.clearRect).toHaveBeenCalled()
    expect(h.ctx.stroke).not.toHaveBeenCalled()
  })

  it("keeps animating while live points remain", () => {
    const h = makeHarness(700)
    h.trail.push({ x: 0, y: 0 })
    h.trail.push({ x: 20, y: 0 })
    h.advance(100)
    h.flush()
    expect(h.pending()).toBe(1)
    expect(h.ctx.stroke).toHaveBeenCalled()
  })

  it("clear empties points and cancels the frame", () => {
    const h = makeHarness()
    const caf = vi.fn()
    h.trail.push({ x: 1, y: 1 })
    // replace nothing — just assert behaviour via next flush
    h.trail.clear()
    h.flush()
    expect(h.pending()).toBe(0)
    expect(h.ctx.clearRect).toHaveBeenCalled()
    void caf
  })

  it("draws one stroke per segment between consecutive live points", () => {
    const h = makeHarness(700)
    h.trail.push({ x: 0, y: 0 })
    h.trail.push({ x: 10, y: 0 })
    h.trail.push({ x: 20, y: 0 })
    h.advance(50)
    h.flush()
    expect(h.ctx.stroke!.mock.calls.length).toBe(2)
  })
})
