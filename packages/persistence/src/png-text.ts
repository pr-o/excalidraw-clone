const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const TEXT_TYPE = new TextEncoder().encode("tEXt")
const IEND_TYPE_BYTES = [0x49, 0x45, 0x4e, 0x44]

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  crcTable = table
  return table
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeU32BE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false)
}

function assertPngSignature(bytes: Uint8Array): void {
  if (bytes.length < PNG_SIGNATURE.length) throw new Error("png-text: file too small")
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("png-text: not a PNG")
  }
}

function buildTextChunk(keyword: string, text: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword)
  if (keywordBytes.length < 1 || keywordBytes.length > 79) {
    throw new Error("png-text: keyword length must be 1..79")
  }
  const textBytes = new TextEncoder().encode(text)
  const dataLen = keywordBytes.length + 1 + textBytes.length
  const chunk = new Uint8Array(4 + 4 + dataLen + 4)
  const view = new DataView(chunk.buffer)
  writeU32BE(view, 0, dataLen)
  chunk.set(TEXT_TYPE, 4)
  chunk.set(keywordBytes, 8)
  chunk[8 + keywordBytes.length] = 0
  chunk.set(textBytes, 8 + keywordBytes.length + 1)
  const typeAndData = chunk.subarray(4, 4 + 4 + dataLen)
  writeU32BE(view, 4 + 4 + dataLen, crc32(typeAndData))
  return chunk
}

export async function embedTextChunk(blob: Blob, keyword: string, text: string): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assertPngSignature(bytes)

  let cursor = PNG_SIGNATURE.length
  while (cursor + 8 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + cursor, 8)
    const length = view.getUint32(0, false)
    const isIend =
      bytes[cursor + 4] === IEND_TYPE_BYTES[0] &&
      bytes[cursor + 5] === IEND_TYPE_BYTES[1] &&
      bytes[cursor + 6] === IEND_TYPE_BYTES[2] &&
      bytes[cursor + 7] === IEND_TYPE_BYTES[3]
    if (isIend) break
    cursor += 4 + 4 + length + 4
  }
  if (cursor + 8 > bytes.length) throw new Error("png-text: IEND not found")

  const chunk = buildTextChunk(keyword, text)
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, cursor), 0)
  out.set(chunk, cursor)
  out.set(bytes.subarray(cursor), cursor + chunk.length)
  return new Blob([out], { type: "image/png" })
}

export async function extractTextChunk(blob: Blob, keyword: string): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assertPngSignature(bytes)
  const decoder = new TextDecoder()
  let cursor = PNG_SIGNATURE.length
  while (cursor + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + cursor, 8)
    const length = view.getUint32(0, false)
    const type = String.fromCharCode(
      bytes[cursor + 4]!,
      bytes[cursor + 5]!,
      bytes[cursor + 6]!,
      bytes[cursor + 7]!,
    )
    if (type === "tEXt") {
      const data = bytes.subarray(cursor + 8, cursor + 8 + length)
      let nullAt = -1
      for (let i = 0; i < data.length; i += 1) {
        if (data[i] === 0) {
          nullAt = i
          break
        }
      }
      if (nullAt >= 0) {
        const key = decoder.decode(data.subarray(0, nullAt))
        if (key === keyword) {
          return decoder.decode(data.subarray(nullAt + 1))
        }
      }
    }
    if (type === "IEND") break
    cursor += 4 + 4 + length + 4
  }
  return null
}

export const PNG_EXCALIDRAW_KEYWORD = "application/vnd.excalidraw+json"
