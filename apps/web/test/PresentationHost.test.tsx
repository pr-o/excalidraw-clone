import { fitToContent, type ViewTransform } from "@excalidraw-clone/geometry"
import { newFrame, Scene, type ExcalidrawFrameElement } from "@excalidraw-clone/scene"
import { act, cleanup, render, screen } from "@testing-library/react"
import React from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ensureI18n } from "../src/i18n"
import { PresentationHost } from "../src/presentation/PresentationHost"
import { useAppStore } from "../src/store"

/** Distinctive pre-entry camera, so a restore is unmistakable. */
const SNAPSHOT: ViewTransform = { scrollX: 7, scrollY: 9, zoom: 1 }

const requestFullscreen = vi.fn<() => Promise<void>>(() => Promise.resolve())
const exitFullscreen = vi.fn<() => Promise<void>>(() => Promise.resolve())
let fullscreenElement: Element | null = null

HTMLElement.prototype.requestFullscreen = requestFullscreen
document.exitFullscreen = exitFullscreen
Object.defineProperty(document, "fullscreenElement", {
  configurable: true,
  get: () => fullscreenElement,
})

const makeFrames = (): ExcalidrawFrameElement[] => [
  newFrame({ x: 0, y: 0, width: 400, height: 300 }),
  newFrame({ x: 1000, y: 0, width: 400, height: 300 }),
  newFrame({ x: 2000, y: 0, width: 400, height: 300 }),
]

const expectedView = (f: ExcalidrawFrameElement): ViewTransform =>
  fitToContent(
    { x: f.x, y: f.y, width: f.width, height: f.height },
    window.innerWidth,
    window.innerHeight,
  )

const currentView = (): ViewTransform => {
  const { scrollX, scrollY, zoom } = useAppStore.getState()
  return { scrollX, scrollY, zoom }
}

const expectViewToBe = (actual: ViewTransform, expected: ViewTransform): void => {
  expect(actual.scrollX).toBeCloseTo(expected.scrollX, 5)
  expect(actual.scrollY).toBeCloseTo(expected.scrollY, 5)
  expect(actual.zoom).toBeCloseTo(expected.zoom, 5)
}

const press = (key: string): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  })
}

const counter = (): string => screen.getByTestId("presentation-counter").textContent ?? ""

const renderHost = (scene: Scene) =>
  render(
    <I18nextProvider i18n={ensureI18n("en")}>
      <PresentationHost scene={scene} rootEl={document.body} />
    </I18nextProvider>,
  )

let frames: ExcalidrawFrameElement[]
let scene: Scene

beforeEach(() => {
  requestFullscreen.mockClear()
  exitFullscreen.mockClear()
  fullscreenElement = null

  // A far-future timestamp makes `animateView` land on its final frame in a
  // single synchronous tick (a `performance.now()` timestamp instead would
  // busy-recurse for the whole 400ms duration).
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cb(performance.now() + 10_000)
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", (): void => {})

  frames = makeFrames()
  scene = new Scene(frames)
  useAppStore.getState().enterPresentation()
  useAppStore.getState().setView(SNAPSHOT)
})

afterEach(() => {
  cleanup()
  useAppStore.getState().exitPresentation()
  useAppStore.getState().setActiveTool("selection")
  useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
  vi.unstubAllGlobals()
})

describe("PresentationHost", () => {
  it("renders a 1-based counter for the first slide", () => {
    renderHost(scene)

    expect(counter()).toBe("1 / 3")
  })

  it("requests fullscreen on the provided root element on mount", () => {
    renderHost(scene)

    expect(requestFullscreen).toHaveBeenCalled()
  })

  it("fits the camera to the first frame on mount", () => {
    renderHost(scene)

    expectViewToBe(currentView(), expectedView(frames[0]!))
  })

  it("advances on ArrowRight and drives the camera to that frame", () => {
    renderHost(scene)

    press("ArrowRight")

    expect(counter()).toBe("2 / 3")
    expectViewToBe(currentView(), expectedView(frames[1]!))
  })

  it("floors at the first slide on ArrowLeft", () => {
    renderHost(scene)

    press("ArrowLeft")

    expect(counter()).toBe("1 / 3")
    expect(useAppStore.getState().slideIndex).toBe(0)
  })

  it("does not advance past the last slide", () => {
    renderHost(scene)

    press("End")
    expect(counter()).toBe("3 / 3")

    press("ArrowRight")
    expect(counter()).toBe("3 / 3")
    expect(useAppStore.getState().slideIndex).toBe(2)
  })

  it("exits presentation on Escape and restores the entry camera on unmount", () => {
    const { unmount } = renderHost(scene)
    press("ArrowRight")

    press("Escape")
    expect(useAppStore.getState().presenting).toBe(false)

    act(() => unmount())
    expectViewToBe(currentView(), SNAPSHOT)
  })

  it("auto-exits when every frame is deleted", () => {
    renderHost(scene)

    act(() => {
      scene.mutate((draft) => {
        draft.forEach((e, i) => {
          draft[i] = { ...e, isDeleted: true }
        })
      })
    })

    expect(useAppStore.getState().presenting).toBe(false)
  })
})
