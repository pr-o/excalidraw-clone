import { newRectangle, Scene } from "@excalidraw-clone/scene"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { I18nextProvider } from "react-i18next"
import { LinkOverlay } from "../src/components/LinkOverlay"
import { ensureI18n } from "../src/i18n"
import { useAppStore } from "../src/store"

const renderOverlay = (scene: Scene) =>
  render(
    <I18nextProvider i18n={ensureI18n("en")}>
      <LinkOverlay scene={scene} />
    </I18nextProvider>,
  )

beforeEach(() => {
  useAppStore.getState().setLinkEditorElementId(null)
  useAppStore.getState().setSelection([])
  useAppStore.setState({ lastScenePointer: null })
  useAppStore.getState().setPointerOverCanvas(false)
  useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
})
afterEach(() => cleanup())

describe("LinkOverlay — editor mode", () => {
  it("renders an input seeded from the element's link, plus a remove button", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 10, y: 20, width: 30, height: 30 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setLinkEditorElementId(rect.id)

    renderOverlay(scene)

    const input = screen.getByTestId<HTMLInputElement>("link-editor-input")
    expect(input.value).toBe("https://a.com")
    expect(screen.getByTestId("link-editor-remove")).toBeDefined()
  })

  it("renders no remove button when the element has no link yet", () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setLinkEditorElementId(rect.id)

    const { container } = renderOverlay(scene)

    expect(screen.getByTestId("link-editor-input")).toBeDefined()
    expect(container.querySelector('[data-testid="link-editor-remove"]')).toBeNull()
  })

  it("commits the normalized link on click-away blur and closes the editor", () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setLinkEditorElementId(rect.id)

    renderOverlay(scene)

    fireEvent.change(screen.getByTestId("link-editor-input"), {
      target: { value: "example.com" },
    })
    fireEvent.blur(screen.getByTestId("link-editor"), { relatedTarget: null })

    expect(scene.getElements().find((e) => e.id === rect.id)?.link).toBe("https://example.com")
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })

  it("closes the editor on blur without changing an untouched link", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setLinkEditorElementId(rect.id)

    renderOverlay(scene)

    expect(() =>
      fireEvent.blur(screen.getByTestId("link-editor"), { relatedTarget: null }),
    ).not.toThrow()

    expect(scene.getElements().find((e) => e.id === rect.id)?.link).toBe("https://a.com")
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })

  it("clamps the editor popover to a non-negative top for an element at the canvas top", () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 0, y: 0, width: 40, height: 30 })
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setLinkEditorElementId(rect.id)

    renderOverlay(scene)

    const top = parseFloat(screen.getByTestId("link-editor").style.top)
    expect(top).toBeGreaterThanOrEqual(0)
  })

  it("clamps the editor popover left within the viewport near the right edge", () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 5000, y: 200, width: 40, height: 30 })
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setLinkEditorElementId(rect.id)

    renderOverlay(scene)

    const left = parseFloat(screen.getByTestId("link-editor").style.left)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left).toBeLessThanOrEqual(window.innerWidth)
  })

  it("renders nothing when the editor id is not an element in the scene", () => {
    const scene = new Scene()
    useAppStore.getState().setLinkEditorElementId("missing")

    const { container } = renderOverlay(scene)

    expect(container.querySelector('[data-testid="link-editor"]')).toBeNull()
  })
})

describe("LinkOverlay — indicator mode", () => {
  it("shows the link indicator for a single selected linked element", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setSelection([rect.id])

    renderOverlay(scene)

    const indicator = screen.getByTestId("link-indicator")
    expect(indicator).toBeDefined()
    expect(indicator.getAttribute("title")).toBe("https://a.com/")
  })

  it("shows no indicator when the sole selected element has no link", () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setSelection([rect.id])

    const { container } = renderOverlay(scene)

    expect(container.querySelector('[data-testid="link-indicator"]')).toBeNull()
  })

  it("shows no indicator for a multi-selection even when both are linked", () => {
    const scene = new Scene()
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    const b = { ...newRectangle({ x: 40, y: 0, width: 10, height: 10 }), link: "https://b.com" }
    scene.mutate((d) => d.push(a, b))
    useAppStore.getState().setSelection([a.id, b.id])

    const { container } = renderOverlay(scene)

    expect(container.querySelector('[data-testid="link-indicator"]')).toBeNull()
  })

  it("falls back to the linked element under the last scene pointer", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.setState({ lastScenePointer: { x: 50, y: 50 } })
    useAppStore.getState().setPointerOverCanvas(true)

    renderOverlay(scene)

    expect(screen.getByTestId("link-indicator")).toBeDefined()
  })

  it("hides the pointer-fallback indicator once the pointer has left the canvas", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.setState({ lastScenePointer: { x: 50, y: 50 } })
    useAppStore.getState().setPointerOverCanvas(false)

    const { container } = renderOverlay(scene)

    expect(container.querySelector('[data-testid="link-indicator"]')).toBeNull()
  })

  it("shows the pointer-fallback indicator while the pointer is over the canvas", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.setState({ lastScenePointer: { x: 50, y: 50 } })
    useAppStore.getState().setPointerOverCanvas(true)

    renderOverlay(scene)

    expect(screen.getByTestId("link-indicator")).toBeDefined()
  })

  it("clamps the indicator to a non-negative top for an element at the canvas top", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setSelection([rect.id])

    renderOverlay(scene)

    const top = parseFloat(screen.getByTestId("link-indicator").style.top)
    expect(top).toBeGreaterThanOrEqual(0)
  })
})
