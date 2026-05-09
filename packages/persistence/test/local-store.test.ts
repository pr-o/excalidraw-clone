import { newRectangle, type ExcalidrawData } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { clearLocal, loadScene, loadUI, saveScene, saveUI } from "../src/local-store"

const sampleData = (): ExcalidrawData => ({
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw-clone.local",
  elements: [newRectangle({ x: 10, y: 20, width: 100, height: 50 })],
})

describe("local-store: scene", () => {
  it("loadScene returns null when key missing", () => {
    expect(loadScene()).toBeNull()
  })

  it("saveScene then loadScene round-trips", () => {
    const data = sampleData()
    saveScene(data)
    const restored = loadScene()
    expect(restored?.elements.length).toBe(1)
    expect(restored?.elements[0]?.type).toBe("rectangle")
  })

  it("loadScene returns null on malformed JSON instead of throwing", () => {
    localStorage.setItem("excalidraw-scene", "{not-json")
    expect(loadScene()).toBeNull()
  })

  it("loadScene returns null when payload shape is wrong", () => {
    localStorage.setItem("excalidraw-scene", JSON.stringify({ type: "wrong" }))
    expect(loadScene()).toBeNull()
  })
})

describe("local-store: ui", () => {
  it("saveUI then loadUI round-trips", () => {
    saveUI({ theme: "dark", zenMode: true })
    expect(loadUI()).toEqual({ theme: "dark", zenMode: true })
  })

  it("loadUI returns null on parse error", () => {
    localStorage.setItem("excalidraw-ui", "garbage")
    expect(loadUI()).toBeNull()
  })
})

describe("local-store: clearLocal", () => {
  it("removes both keys", () => {
    saveScene(sampleData())
    saveUI({ theme: "dark" })
    clearLocal()
    expect(loadScene()).toBeNull()
    expect(loadUI()).toBeNull()
  })
})
