import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAutoSaver } from "../src/auto-save"

describe("createAutoSaver", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("debounces — single flush after delay even with many schedule() calls", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.schedule()
    saver.schedule()
    saver.schedule()
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(499)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("re-arms timer on each schedule()", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.schedule()
    vi.advanceTimersByTime(400)
    saver.schedule()
    vi.advanceTimersByTime(400)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("flushNow() flushes immediately and cancels pending timer", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.schedule()
    saver.flushNow()
    expect(flush).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("flushNow() is a no-op when nothing scheduled", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.flushNow()
    expect(flush).not.toHaveBeenCalled()
  })

  it("dispose() cancels pending timer and prevents further flushes", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.schedule()
    saver.dispose()
    vi.advanceTimersByTime(1000)
    expect(flush).not.toHaveBeenCalled()
    saver.schedule()
    vi.advanceTimersByTime(1000)
    expect(flush).not.toHaveBeenCalled()
  })
})
