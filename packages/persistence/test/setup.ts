import "fake-indexeddb/auto"
import { Blob as NodeBlob, File as NodeFile } from "node:buffer"
import { afterEach, beforeEach } from "vitest"
import { _resetDBForTesting } from "../src/image-store"

// jsdom's Blob/File lack arrayBuffer(); Node's native Blob/File have the full
// spec-compliant API. They're safe to swap into globalThis for tests.
globalThis.Blob = NodeBlob as unknown as typeof globalThis.Blob
globalThis.File = NodeFile as unknown as typeof globalThis.File

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
  await _resetDBForTesting()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("excalidraw-clone")
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error("indexedDB.deleteDatabase failed"))
    req.onblocked = () => resolve()
  })
})
