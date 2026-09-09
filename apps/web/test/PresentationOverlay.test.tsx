import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PresentationOverlay } from "../src/presentation/PresentationOverlay"

const t = (key: string): string => key

interface Overrides {
  index?: number
  count?: number
  onPrev?: () => void
  onNext?: () => void
  laserActive?: boolean
  onToggleLaser?: () => void
}

const renderOverlay = (overrides: Overrides = {}) =>
  render(
    <PresentationOverlay
      index={overrides.index ?? 0}
      count={overrides.count ?? 3}
      onPrev={overrides.onPrev ?? (() => {})}
      onNext={overrides.onNext ?? (() => {})}
      laserActive={overrides.laserActive ?? false}
      onToggleLaser={overrides.onToggleLaser ?? (() => {})}
      t={t}
    />,
  )

const button = (testId: string): HTMLButtonElement => screen.getByTestId<HTMLButtonElement>(testId)

const overlay = (): HTMLElement => screen.getByTestId("presentation-overlay")

/** Dispatch a bubbling keydown from a real in-document node (not `window`). */
const pressKey = (key: string): void => {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("PresentationOverlay", () => {
  it("renders a 1-based counter of the current slide", () => {
    renderOverlay({ index: 0, count: 3 })

    expect(screen.getByTestId("presentation-counter").textContent).toBe("1 / 3")
  })

  it("disables prev on the first slide but keeps next enabled", () => {
    renderOverlay({ index: 0, count: 3 })

    expect(button("presentation-prev").disabled).toBe(true)
    expect(button("presentation-next").disabled).toBe(false)
  })

  it("disables next on the last slide but keeps prev enabled", () => {
    renderOverlay({ index: 2, count: 3 })

    expect(button("presentation-next").disabled).toBe(true)
    expect(button("presentation-prev").disabled).toBe(false)
  })

  it("enables both nav buttons on a middle slide", () => {
    renderOverlay({ index: 1, count: 3 })

    expect(button("presentation-prev").disabled).toBe(false)
    expect(button("presentation-next").disabled).toBe(false)
  })

  it("fires the matching handler for prev, next and laser clicks", async () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const onToggleLaser = vi.fn()
    renderOverlay({ index: 1, count: 3, onPrev, onNext, onToggleLaser })

    await userEvent.click(button("presentation-prev"))
    await userEvent.click(button("presentation-next"))
    await userEvent.click(button("presentation-laser"))

    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onToggleLaser).toHaveBeenCalledTimes(1)
  })

  it("reflects the laser state via aria-pressed", () => {
    renderOverlay({ laserActive: true })
    expect(button("presentation-laser").getAttribute("aria-pressed")).toBe("true")
    cleanup()

    renderOverlay({ laserActive: false })
    expect(button("presentation-laser").getAttribute("aria-pressed")).toBe("false")
  })

  it("renders the laser icon SVG rather than a text glyph", () => {
    renderOverlay()

    const laser = button("presentation-laser")
    expect(laser.querySelector("svg")).not.toBeNull()
    expect(laser.textContent ?? "").not.toContain("✦")
  })

  it("fades out after 3s of inactivity and wakes on a plain keydown", () => {
    vi.useFakeTimers()
    renderOverlay()

    expect(overlay().className).toContain("opacity-100")

    act(() => void vi.advanceTimersByTime(3000))
    expect(overlay().className).toContain("opacity-0")
    expect(overlay().className).toContain("pointer-events-none")

    pressKey("ArrowRight")
    expect(overlay().className).toContain("opacity-100")
  })

  it("wakes on a nav key the host swallows in the capture phase", () => {
    vi.useFakeTimers()
    renderOverlay()

    // Mimic PresentationHost: a capture-phase window listener that swallows
    // navigation keys before they can reach the target / bubble phases.
    const swallow = (e: KeyboardEvent): void => {
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener("keydown", swallow, { capture: true })

    try {
      act(() => void vi.advanceTimersByTime(3000))
      expect(overlay().className).toContain("opacity-0")

      pressKey("ArrowRight")
      expect(overlay().className).toContain("opacity-100")
    } finally {
      window.removeEventListener("keydown", swallow, { capture: true })
    }
  })

  it("exposes every overlay test id", () => {
    renderOverlay({ index: 1, count: 3 })

    for (const id of [
      "presentation-overlay",
      "presentation-prev",
      "presentation-next",
      "presentation-counter",
      "presentation-laser",
    ]) {
      expect(screen.getByTestId(id)).toBeDefined()
    }
  })
})
