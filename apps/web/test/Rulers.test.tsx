import { Scene } from "@excalidraw-clone/scene"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Rulers } from "../src/components/Rulers"
import { useAppStore } from "../src/store"

const setRulers = (on: boolean): void => {
  if (useAppStore.getState().rulersVisible !== on) useAppStore.getState().toggleRulers()
}

describe("Rulers", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    HTMLElement.prototype.setPointerCapture = vi.fn()
    HTMLElement.prototype.releasePointerCapture = vi.fn()
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
    setRulers(false)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders nothing while rulers are hidden", () => {
    render(<Rulers scene={new Scene()} />)
    expect(screen.queryByTestId("ruler-top")).toBeNull()
  })

  it("dragging out of the top ruler creates, moves and (back on the ruler) deletes a horizontal guide", () => {
    setRulers(true)
    const scene = new Scene()
    render(
      <div>
        <Rulers scene={scene} />
      </div>,
    )
    const top = screen.getByTestId("ruler-top")
    expect(screen.getByTestId("ruler-left")).toBeDefined()
    act(() => {
      fireEvent.pointerDown(top, { button: 0, pointerId: 1, clientX: 200, clientY: 10 })
      fireEvent.pointerMove(top, { pointerId: 1, clientX: 200, clientY: 120 })
    })
    expect(scene.getGuides()).toEqual({ x: [], y: [120] })
    act(() => {
      fireEvent.pointerMove(top, { pointerId: 1, clientX: 200, clientY: 140 })
    })
    expect(scene.getGuides().y).toEqual([140])
    act(() => {
      fireEvent.pointerMove(top, { pointerId: 1, clientX: 200, clientY: 5 })
      fireEvent.pointerUp(top, { pointerId: 1, clientX: 200, clientY: 5 })
    })
    expect(scene.getGuides().y).toEqual([])
  })
})
