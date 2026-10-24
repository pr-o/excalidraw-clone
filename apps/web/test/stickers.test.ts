import { Scene } from "@excalidraw-clone/scene"
import { beforeEach, describe, expect, it } from "vitest"
import { buildSticker, insertSticker, STICKER_FONT_SIZE } from "../src/driver/stickers"
import { useAppStore } from "../src/store"

const measure = (): { width: number; height: number } => ({ width: 80, height: 100 })

describe("buildSticker", () => {
  it("makes a large free text element centred on the point", () => {
    const el = buildSticker("🎉", { x: 500, y: 300 }, measure)
    expect(el).toMatchObject({
      type: "text",
      text: "🎉",
      originalText: "🎉",
      fontSize: STICKER_FONT_SIZE,
      containerId: null,
      x: 460,
      y: 250,
      width: 80,
      height: 100,
    })
  })

  it("falls back to an estimated square when it cannot measure", () => {
    const el = buildSticker("🎉", { x: 0, y: 0 }, () => undefined)
    expect(el.width).toBeGreaterThan(0)
    expect(el.height).toBeGreaterThan(0)
  })
})

describe("insertSticker", () => {
  beforeEach(() => {
    useAppStore.setState({ viewMode: false, presenting: false, selectedIds: [] })
  })

  it("adds the sticker in one undo step and selects it", () => {
    const scene = new Scene()
    insertSticker(scene, "🐱", measure)
    const [el] = scene.getElements()
    expect(el).toMatchObject({ type: "text", text: "🐱" })
    expect(useAppStore.getState().selectedIds).toEqual([el!.id])
    scene.undo()
    expect(scene.getElements()).toHaveLength(0)
  })

  it("does nothing in view mode or while presenting", () => {
    const scene = new Scene()
    useAppStore.setState({ viewMode: true })
    insertSticker(scene, "🐱", measure)
    useAppStore.setState({ viewMode: false, presenting: true })
    insertSticker(scene, "🐱", measure)
    expect(scene.getElements()).toHaveLength(0)
  })
})
