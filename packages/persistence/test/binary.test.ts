import { describe, expect, it } from "vitest"
import { blobToDataURL, dataURLToBlob, sha256Hex } from "../src/binary"

describe("sha256Hex", () => {
  it("hashes empty input to known constant", async () => {
    const blob = new Blob([])
    const hex = await sha256Hex(blob)
    expect(hex).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  it("hashes 'abc' to known constant", async () => {
    const blob = new Blob(["abc"])
    const hex = await sha256Hex(blob)
    expect(hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})

describe("blob <-> dataURL round-trip", () => {
  it("preserves bytes and mime", async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "image/png" })
    const url = await blobToDataURL(original)
    expect(url.startsWith("data:image/png;base64,")).toBe(true)
    const restored = dataURLToBlob(url)
    expect(restored.type).toBe("image/png")
    expect(restored.size).toBe(5)
    const buf = new Uint8Array(await restored.arrayBuffer())
    expect([...buf]).toEqual([1, 2, 3, 4, 5])
  })

  it("dataURLToBlob throws on malformed input", () => {
    expect(() => dataURLToBlob("not-a-data-url")).toThrow()
  })
})
