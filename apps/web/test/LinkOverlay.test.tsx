import { newRectangle, Scene } from "@excalidraw-clone/scene"
import { cleanup, render, screen } from "@testing-library/react"
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

  it("renders nothing when the editor id is not an element in the scene", () => {
    const scene = new Scene()
    useAppStore.getState().setLinkEditorElementId("missing")

    const { container } = renderOverlay(scene)

    expect(container.querySelector('[data-testid="link-editor"]')).toBeNull()
  })
})
