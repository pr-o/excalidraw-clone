import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ViewTransform } from "@excalidraw-clone/geometry"
import { animateView } from "../src/presentation/animateView"

let rafCbs: Array<(t: number) => void> = []
let now = 0
let rafSpy: ReturnType<typeof vi.fn>
let cafSpy: ReturnType<typeof vi.fn>

const flush = (dt: number): void => {
  now += dt
  const cbs = rafCbs
  rafCbs = []
  for (const cb of cbs) cb(now)
}

beforeEach(() => {
  vi.useFakeTimers()
  rafCbs = []
  now = 0
  rafSpy = vi.fn((cb: (t: number) => void) => {
    rafCbs.push(cb)
    return rafCbs.length
  })
  cafSpy = vi.fn()
  vi.stubGlobal("requestAnimationFrame", rafSpy)
  vi.stubGlobal("cancelAnimationFrame", cafSpy)
  vi.stubGlobal("performance", { now: () => now })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const from: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
const to: ViewTransform = { scrollX: 100, scrollY: 200, zoom: 2 }

describe("animateView", () => {
  it("progresses monotonically and emits exactly `to` as the final frame", () => {
    const frames: ViewTransform[] = []
    animateView(from, to, 400, (v) => frames.push(v))

    for (let i = 0; i < 5; i++) flush(80)

    expect(frames.length).toBeGreaterThan(1)

    // monotonically non-decreasing scrollX
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.scrollX).toBeGreaterThanOrEqual(frames[i - 1]!.scrollX)
    }

    // every intermediate frame strictly between `from` and `to`
    for (const f of frames.slice(0, -1)) {
      expect(f.scrollX).toBeGreaterThan(from.scrollX)
      expect(f.scrollX).toBeLessThan(to.scrollX)
      expect(f.scrollY).toBeGreaterThan(from.scrollY)
      expect(f.scrollY).toBeLessThan(to.scrollY)
      expect(f.zoom).toBeGreaterThan(from.zoom)
      expect(f.zoom).toBeLessThan(to.zoom)
    }

    // last frame is exactly `to`
    expect(frames[frames.length - 1]).toEqual(to)
  })

  it("with durationMs = 0 calls onFrame once synchronously and never schedules a frame", () => {
    const onFrame = vi.fn()
    animateView(from, to, 0, onFrame)

    expect(onFrame).toHaveBeenCalledTimes(1)
    expect(onFrame).toHaveBeenCalledWith(to)
    expect(rafSpy).toHaveBeenCalledTimes(0)
    expect(rafCbs.length).toBe(0)
  })

  it("cancel stops any further onFrame calls", () => {
    const onFrame = vi.fn()
    const cancel = animateView(from, to, 400, onFrame)

    flush(80)
    expect(onFrame).toHaveBeenCalledTimes(1)

    cancel()
    const callsAtCancel = onFrame.mock.calls.length
    flush(400)

    expect(onFrame).toHaveBeenCalledTimes(callsAtCancel)
    expect(cafSpy).toHaveBeenCalled()
  })
})
