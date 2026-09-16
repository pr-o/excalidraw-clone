import { fitToContent, type ViewTransform } from "@excalidraw-clone/geometry"
import {
  getElementBounds,
  newRectangle,
  newText,
  Scene,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FindHost } from "../src/components/FindHost"
import { ensureI18n } from "../src/i18n"
import { useAppStore } from "../src/store"

/** Distinctive camera, so any jump (or absence of one) is unmistakable. */
const SNAPSHOT: ViewTransform = { scrollX: 7, scrollY: 9, zoom: 1 }

const currentView = (): ViewTransform => {
  const { scrollX, scrollY, zoom } = useAppStore.getState()
  return { scrollX, scrollY, zoom }
}

const expectedView = (el: ExcalidrawElement): ViewTransform =>
  fitToContent(getElementBounds(el), window.innerWidth, window.innerHeight)

const expectViewToBe = (actual: ViewTransform, expected: ViewTransform): void => {
  expect(actual.scrollX).toBeCloseTo(expected.scrollX, 5)
  expect(actual.scrollY).toBeCloseTo(expected.scrollY, 5)
  expect(actual.zoom).toBeCloseTo(expected.zoom, 5)
}

const renderHost = (scene: Scene) =>
  render(
    <I18nextProvider i18n={ensureI18n("en")}>
      <FindHost scene={scene} />
    </I18nextProvider>,
  )

const typeQuery = (q: string): void => {
  fireEvent.change(screen.getByTestId("find-input"), { target: { value: q } })
}
const clickNext = (): void => {
  fireEvent.click(screen.getByTestId("find-next"))
}
const clickPrev = (): void => {
  fireEvent.click(screen.getByTestId("find-prev"))
}
const counter = (): string => screen.getByTestId("find-counter").textContent ?? ""

const text = (x: number, y: number, label: string): ExcalidrawTextElement =>
  newText({ x, y, width: 120, height: 24, text: label })

beforeEach(() => {
  // A far-future timestamp makes `animateView` land on its final frame in a
  // single synchronous tick.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cb(performance.now() + 10_000)
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", (): void => {})

  useAppStore.getState().setSelection([])
  useAppStore.getState().setView(SNAPSHOT)
  useAppStore.getState().setFindOpen(true)
})

afterEach(() => {
  cleanup()
  useAppStore.getState().setFindOpen(false)
  useAppStore.getState().setSelection([])
  useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
  vi.unstubAllGlobals()
})

describe("FindHost", () => {
  it("updates the counter as the query is typed without moving the camera", () => {
    const alpha = text(0, 0, "Alpha one")
    renderHost(new Scene([alpha]))

    typeQuery("alpha")

    expect(counter()).toBe("1 of 1")
    expectViewToBe(currentView(), SNAPSHOT)
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("jumps to the FIRST match on the very first next press and selects it", () => {
    const first = text(0, 0, "Alpha one")
    const second = text(1000, 500, "Alpha two")
    renderHost(new Scene([first, second]))

    typeQuery("alpha")
    expect(counter()).toBe("1 of 2")

    clickNext()

    expect(counter()).toBe("1 of 2")
    expectViewToBe(currentView(), expectedView(first))
    expect(useAppStore.getState().selectedIds).toEqual([first.id])
  })

  it("advances to the second match on the second next press", () => {
    const first = text(0, 0, "Alpha one")
    const second = text(1000, 500, "Alpha two")
    renderHost(new Scene([first, second]))

    typeQuery("alpha")
    clickNext()
    clickNext()

    expect(counter()).toBe("2 of 2")
    expectViewToBe(currentView(), expectedView(second))
    expect(useAppStore.getState().selectedIds).toEqual([second.id])
  })

  it("cycles backward with wraparound: prev from match 1 lands on the last match", () => {
    const first = text(0, 0, "Alpha one")
    const second = text(1000, 500, "Alpha two")
    renderHost(new Scene([first, second]))

    typeQuery("alpha")
    clickNext()
    clickPrev()

    expect(counter()).toBe("2 of 2")
    expectViewToBe(currentView(), expectedView(second))
    expect(useAppStore.getState().selectedIds).toEqual([second.id])
  })

  it("jumps to a locked match but leaves the selection untouched", () => {
    const locked: ExcalidrawTextElement = { ...text(1000, 500, "Alpha locked"), locked: true }
    const decoy = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    renderHost(new Scene([decoy, locked]))
    act(() => useAppStore.getState().setSelection([decoy.id]))

    typeQuery("alpha")
    clickNext()

    expectViewToBe(currentView(), expectedView(locked))
    expect(useAppStore.getState().selectedIds).toEqual([decoy.id])
  })

  it("re-jumps to the tracked match when Find is closed and reopened", () => {
    const first = text(0, 0, "Alpha one")
    const second = text(1000, 500, "Alpha two")
    renderHost(new Scene([first, second]))

    typeQuery("alpha")
    clickNext()
    clickNext()
    expect(counter()).toBe("2 of 2")

    // Drift the camera away, then close and reopen with the same query.
    act(() => useAppStore.getState().setView(SNAPSHOT))
    fireEvent.keyDown(screen.getByTestId("find-input"), { key: "Escape" })
    expect(useAppStore.getState().findOpen).toBe(false)

    act(() => useAppStore.getState().setFindOpen(true))

    expect(counter()).toBe("2 of 2")
    expectViewToBe(currentView(), expectedView(second))
  })

  describe("bound labels", () => {
    it("jumps to and selects the CONTAINER of a matched bound label", () => {
      const shape = newRectangle({ x: 2000, y: 300, width: 200, height: 100 })
      const label: ExcalidrawTextElement = {
        ...text(2010, 340, "Gamma label"),
        containerId: shape.id,
      }
      const container = { ...shape, boundElements: [{ id: label.id, type: "text" as const }] }
      renderHost(new Scene([container, label]))

      typeQuery("gamma")
      clickNext()

      expectViewToBe(currentView(), expectedView(container))
      expect(useAppStore.getState().selectedIds).toEqual([container.id])
    })

    it("leaves the selection untouched when a matched bound label's container is locked", () => {
      const shape = { ...newRectangle({ x: 2000, y: 300, width: 200, height: 100 }), locked: true }
      const label: ExcalidrawTextElement = {
        ...text(2010, 340, "Gamma label"),
        containerId: shape.id,
      }
      const container = { ...shape, boundElements: [{ id: label.id, type: "text" as const }] }
      const decoy = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      renderHost(new Scene([decoy, container, label]))
      act(() => useAppStore.getState().setSelection([decoy.id]))

      typeQuery("gamma")
      clickNext()

      expectViewToBe(currentView(), expectedView(container))
      expect(useAppStore.getState().selectedIds).toEqual([decoy.id])
    })

    it("falls back to the label itself when its container is missing", () => {
      const orphan: ExcalidrawTextElement = {
        ...text(2010, 340, "Gamma orphan"),
        containerId: "does-not-exist",
      }
      renderHost(new Scene([orphan]))

      typeQuery("gamma")
      clickNext()

      expectViewToBe(currentView(), expectedView(orphan))
      expect(useAppStore.getState().selectedIds).toEqual([orphan.id])
    })
  })
})
