import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The persistence layer is IndexedDB-backed; replace it with an in-memory slot.
const stored: { handle: unknown } = { handle: null }
vi.mock("@excalidraw-clone/persistence", () => ({
  download: vi.fn(),
  getAllFiles: vi.fn(() => Promise.resolve([])),
  serializeDocument: vi.fn(() => ({ type: "excalidraw", version: 3, pages: [] })),
  toExcalidrawBlob: vi.fn(() => new Blob(["{}"])),
  loadCurrentFileHandle: vi.fn(() => Promise.resolve(stored.handle)),
  storeCurrentFileHandle: vi.fn((h: unknown) => {
    stored.handle = h
    return Promise.resolve()
  }),
}))

const { restoreCurrentFile, saveDrawing, setCurrentFile, currentFileName } =
  await import("../src/driver/fileHandle")

type Perm = "granted" | "prompt" | "denied"
const handle = (name: string, query: Perm, request: Perm = query) => {
  const writes: string[] = []
  return {
    writes,
    h: {
      kind: "file",
      name,
      queryPermission: vi.fn(() => Promise.resolve(query)),
      requestPermission: vi.fn(() => Promise.resolve(request)),
      createWritable: () =>
        Promise.resolve({
          write: (b: Blob) => b.text().then((t) => void writes.push(t)),
          close: () => Promise.resolve(),
        }),
    } as unknown as FileSystemFileHandle,
  }
}

const picked = handle("picked.excalidraw", "granted")
const w = window as unknown as Record<string, unknown>

beforeEach(() => {
  stored.handle = null
  setCurrentFile(null)
  picked.writes.length = 0
  w.showSaveFilePicker = vi.fn(() => Promise.resolve(picked.h))
})
afterEach(() => {
  delete w.showSaveFilePicker
})

describe("remembered save file", () => {
  it("is restored from storage after a reload", async () => {
    stored.handle = handle("plan.excalidraw", "granted").h
    await restoreCurrentFile()
    expect(currentFileName()).toBe("plan.excalidraw")
  })

  it("asks for write permission again, then saves without the picker", async () => {
    const remembered = handle("plan.excalidraw", "prompt", "granted")
    stored.handle = remembered.h
    await restoreCurrentFile()
    expect(await saveDrawing([], "p")).toBe(true)
    expect(remembered.writes).toHaveLength(1)
    expect(w.showSaveFilePicker).not.toHaveBeenCalled()
  })

  it("falls back to asking where to save when permission is refused", async () => {
    const remembered = handle("plan.excalidraw", "prompt", "denied")
    stored.handle = remembered.h
    await restoreCurrentFile()
    expect(await saveDrawing([], "p")).toBe(true)
    expect(remembered.writes).toHaveLength(0)
    expect(picked.writes).toHaveLength(1)
    expect(currentFileName()).toBe("picked.excalidraw")
  })

  it("never remembers a PNG as the save target", () => {
    setCurrentFile(handle("shot.png", "granted").h)
    expect(currentFileName()).toBeNull()
    expect(stored.handle).toBeNull()
  })
})
