import { newRectangle, type ExcalidrawData } from "@excalidraw-clone/scene"
import { describe, expect, it, vi } from "vitest"
import { clearLocal, loadScene, loadUI, saveScene, saveUI } from "../src/local-store"

const sampleData = (): ExcalidrawData => ({
  type: "excalidraw",
  version: 3,
  source: "https://excalidraw-clone.local",
  pages: [
    {
      id: "p1",
      name: "Page 1",
      elements: [newRectangle({ x: 10, y: 20, width: 100, height: 50 })],
    },
  ],
  activePageId: "p1",
})

describe("local-store: scene", () => {
  it("loadScene returns null when key missing", () => {
    expect(loadScene()).toBeNull()
  })

  it("saveScene then loadScene round-trips", () => {
    const data = sampleData()
    saveScene(data)
    const restored = loadScene()
    expect(restored?.pages.length).toBe(1)
    expect(restored?.pages[0]?.elements[0]?.type).toBe("rectangle")
  })

  it("loadScene returns null on malformed JSON instead of throwing", () => {
    localStorage.setItem("excalidraw-scene", "{not-json")
    expect(loadScene()).toBeNull()
  })

  it("loadScene returns null when payload shape is wrong", () => {
    localStorage.setItem("excalidraw-scene", JSON.stringify({ type: "wrong" }))
    expect(loadScene()).toBeNull()
  })

  it("loadScene migrates an older (v2) saved scene instead of discarding it", () => {
    const v2 = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw-clone.local",
      elements: [newRectangle({ x: 0, y: 0, width: 10, height: 10 })],
    }
    localStorage.setItem("excalidraw-scene", JSON.stringify(v2))
    const restored = loadScene()
    expect(restored?.version).toBe(3)
    expect(restored?.pages[0]?.elements.length).toBe(1)
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

describe("local-store: failure handling", () => {
  it("keeps an unreadable stored scene under a side key instead of losing it", () => {
    localStorage.setItem("excalidraw-scene", "{not json")
    expect(loadScene()).toBeNull()
    expect(localStorage.getItem("excalidraw-scene-unreadable")).toBe("{not json")
  })

  it("saveScene reports false when the browser rejects the write", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(saveScene(sampleData())).toBe(false)
    spy.mockRestore()
    expect(saveScene(sampleData())).toBe(true)
  })
})
