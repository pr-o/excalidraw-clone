import { describe, expect, it } from "vitest"
import { SCENE_FORMAT_SOURCE, SCENE_FORMAT_VERSION, Scene, newRectangle } from "../src"
import type { ExcalidrawData } from "../src"

describe("Scene.toJSON", () => {
  it("empty scene serializes to v2 shape with empty elements", () => {
    const s = new Scene()
    const data = s.toJSON()
    expect(data).toEqual({
      type: "excalidraw",
      version: SCENE_FORMAT_VERSION,
      source: SCENE_FORMAT_SOURCE,
      elements: [],
    })
  })

  it("includes appState and files when provided", () => {
    const s = new Scene()
    const appState = { zoom: 2 }
    const files = {
      f1: {
        id: "f1",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,AAAA",
        created: 0,
      },
    }
    const data = s.toJSON(appState, files)
    expect(data.appState).toEqual(appState)
    expect(data.files).toEqual(files)
  })

  it("omits appState/files when not provided", () => {
    const data = new Scene().toJSON()
    expect(data.appState).toBeUndefined()
    expect(data.files).toBeUndefined()
  })
})

describe("Scene.loadFromJSON", () => {
  it("replaces elements", () => {
    const s = new Scene()
    const r = newRectangle({ x: 0, y: 0 })
    const data: ExcalidrawData = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [r],
    }
    s.loadFromJSON(data)
    expect(s.getElements()).toEqual([r])
  })

  it("returns embedded appState and files opaquely", () => {
    const s = new Scene()
    const data: ExcalidrawData = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [],
      appState: { custom: "value" },
      files: {
        f1: { id: "f1", mimeType: "image/png", dataURL: "x", created: 0 },
      },
    }
    const out = s.loadFromJSON(data)
    expect(out.appState).toEqual({ custom: "value" })
    expect(out.files?.f1?.id).toBe("f1")
  })

  it("resets history (canUndo false immediately after load)", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    expect(s.canUndo()).toBe(true)
    s.loadFromJSON({
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [],
    })
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
  })
})

describe("Scene round-trip", () => {
  it("loadFromJSON(toJSON()) round-trips elements", () => {
    const s1 = new Scene()
    const r1 = newRectangle({ x: 1, y: 2, width: 3, height: 4 })
    const r2 = newRectangle({ x: 5, y: 6 })
    s1.mutate((d) => {
      d.push(r1, r2)
    })
    const data = s1.toJSON()

    const s2 = new Scene()
    s2.loadFromJSON(data)
    expect(s2.getElements()).toEqual([r1, r2])
  })

  it("v2 file with custom appState round-trips opaquely", () => {
    const original: ExcalidrawData = {
      type: "excalidraw",
      version: 2,
      source: "external",
      elements: [],
      appState: { theme: "dark", arbitraryUnknownKey: 42 },
    }
    const s = new Scene()
    const out = s.loadFromJSON(original)
    expect(out.appState).toEqual(original.appState)
    const reSerialized = s.toJSON(out.appState, out.files)
    expect(reSerialized.appState).toEqual(original.appState)
  })
})
