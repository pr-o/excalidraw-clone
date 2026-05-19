import { describe, expect, it } from "vitest"
import { embedTextChunk, extractTextChunk } from "../src/png-text"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function crc32(bytes: Uint8Array): number {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = table[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function makeMinimalPng(): Blob {
  const ihdrData = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
  const ihdrType = new TextEncoder().encode("IHDR")
  const ihdrTypeAndData = new Uint8Array(ihdrType.length + ihdrData.length)
  ihdrTypeAndData.set(ihdrType, 0)
  ihdrTypeAndData.set(ihdrData, ihdrType.length)
  const ihdr = chunk(ihdrType, ihdrData)
  const iend = chunk(new TextEncoder().encode("IEND"), new Uint8Array(0))
  const all = new Uint8Array(PNG_SIGNATURE.length + ihdr.length + iend.length)
  all.set(PNG_SIGNATURE, 0)
  all.set(ihdr, PNG_SIGNATURE.length)
  all.set(iend, PNG_SIGNATURE.length + ihdr.length)
  return new Blob([all], { type: "image/png" })

  function chunk(type: Uint8Array, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(4 + 4 + data.length + 4)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length, false)
    out.set(type, 4)
    out.set(data, 8)
    const td = new Uint8Array(type.length + data.length)
    td.set(type, 0)
    td.set(data, type.length)
    view.setUint32(8 + data.length, crc32(td), false)
    return out
  }
}

describe("png-text", () => {
  it("round-trips a UTF-8 payload via tEXt", async () => {
    const png = makeMinimalPng()
    const payload = '{"hello":"world","ko":"한글"}'
    const out = await embedTextChunk(png, "test/key", payload)
    const read = await extractTextChunk(out, "test/key")
    expect(read).toBe(payload)
  })

  it("returns null when the keyword is absent", async () => {
    const png = makeMinimalPng()
    expect(await extractTextChunk(png, "missing")).toBeNull()
  })

  it("rejects non-PNG input", async () => {
    const bogus = new Blob([new Uint8Array([0, 1, 2, 3])])
    await expect(extractTextChunk(bogus, "x")).rejects.toThrow(/not a PNG|too small/)
  })
})
