import { newRectangle, Scene } from "@excalidraw-clone/scene"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Minimap } from "../src/components/Minimap"
import { useAppStore } from "../src/store"

const setVisible = (on: boolean): void => {
  if (useAppStore.getState().minimapVisible !== on) useAppStore.getState().toggleMinimap()
}

describe("Minimap", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    HTMLElement.prototype.setPointerCapture = vi.fn()
    HTMLElement.prototype.releasePointerCapture = vi.fn()
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
    setVisible(false)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders nothing while hidden", () => {
    render(<Minimap scene={new Scene()} />)
    expect(screen.queryByTestId("minimap")).toBeNull()
  })

  it("empty page shows the empty state and no viewport rect", () => {
    setVisible(true)
    render(<Minimap scene={new Scene()} />)
    expect(screen.getByTestId("minimap")).toBeDefined()
    expect(screen.queryByTestId("minimap-viewport")).toBeNull()
  })

  it("clicking pans the main view to centre on that point; × hides", () => {
    setVisible(true)
    const scene = new Scene([newRectangle({ x: 5000, y: 0, width: 100, height: 100 })])
    render(<Minimap scene={scene} />)
    const panel = screen.getByTestId("minimap")
    expect(screen.getByTestId("minimap-viewport")).toBeDefined()
    // jsdom rects are all zero, so the click is at minimap (190, 70): right side, content end.
    act(() => {
      fireEvent.pointerDown(panel, { button: 0, pointerId: 1, clientX: 190, clientY: 70 })
    })
    expect(useAppStore.getState().scrollX).toBeLessThan(-1000)
    const x = useAppStore.getState().scrollX
    act(() => {
      fireEvent.pointerMove(panel, { pointerId: 1, clientX: 100, clientY: 70 })
    })
    expect(useAppStore.getState().scrollX).toBeGreaterThan(x)
    act(() => {
      fireEvent.pointerUp(panel, { pointerId: 1 })
    })
    fireEvent.click(screen.getByTestId("minimap-close"))
    expect(useAppStore.getState().minimapVisible).toBe(false)
  })
})
