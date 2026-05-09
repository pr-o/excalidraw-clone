import "fake-indexeddb/auto"
import { Blob as NodeBlob, File as NodeFile } from "node:buffer"
import { beforeEach } from "vitest"

// jsdom's Blob/File lack arrayBuffer(); Node's native Blob/File have the full
// spec-compliant API. They're safe to swap into globalThis for tests.
globalThis.Blob = NodeBlob as unknown as typeof globalThis.Blob
globalThis.File = NodeFile as unknown as typeof globalThis.File

beforeEach(() => {
  localStorage.clear()
})
