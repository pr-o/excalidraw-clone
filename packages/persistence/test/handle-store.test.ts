import { describe, expect, it } from "vitest"
import { loadCurrentFileHandle, storeCurrentFileHandle } from "../src/handle-store"

// fake-indexeddb clones plain objects; a real FileSystemFileHandle clones the same way.
const fakeHandle = { kind: "file", name: "plan.excalidraw" } as unknown as FileSystemFileHandle

describe("current file handle store", () => {
  it("is empty by default", async () => {
    expect(await loadCurrentFileHandle()).toBeNull()
  })

  it("remembers and forgets the handle", async () => {
    await storeCurrentFileHandle(fakeHandle)
    expect((await loadCurrentFileHandle())?.name).toBe("plan.excalidraw")
    await storeCurrentFileHandle(null)
    expect(await loadCurrentFileHandle()).toBeNull()
  })

  it("never throws for a value that cannot be stored", async () => {
    const uncloneable = { name: "x", fn: () => 1 } as unknown as FileSystemFileHandle
    await expect(storeCurrentFileHandle(uncloneable)).resolves.toBeUndefined()
  })
})
