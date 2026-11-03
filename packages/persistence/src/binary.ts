export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  const bytes = new Uint8Array(digest)
  let out = ""
  for (const b of bytes) out += b.toString(16).padStart(2, "0")
  return out
}

/** Encodes in 32 KiB slices: one `fromCharCode` call per slice instead of one
 *  string concatenation per byte, which is slow on multi-megabyte images. */
export async function blobToDataURL(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const SLICE = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + SLICE))
  }
  const mime = blob.type !== "" ? blob.type : "application/octet-stream"
  return `data:${mime};base64,${btoa(binary)}`
}

export function dataURLToBlob(url: string): Blob {
  const match = /^data:([^;]+);base64,(.*)$/.exec(url)
  if (!match) throw new Error("dataURLToBlob: not a base64 data URL")
  const [, mime, b64] = match
  const bin = atob(b64!)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type: mime! })
}
