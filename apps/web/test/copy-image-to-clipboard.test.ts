import { describe, expect, it, vi } from "vitest"
import {
  type ClipboardEnv,
  ClipboardUnsupportedError,
  copyPNGToClipboard,
} from "../src/driver/copyImageToClipboard"

/** Records what it was constructed with, like the real ClipboardItem. */
class FakeClipboardItem {
  readonly data: Record<string, Blob | PromiseLike<Blob>>
  constructor(data: Record<string, Blob | PromiseLike<Blob>>) {
    this.data = data
  }
}

type WriteFn = (items: readonly FakeClipboardItem[]) => Promise<void>

/** A write that, like the browser, waits for the item's data promise. */
const makeWrite = () =>
  vi.fn<WriteFn>((items) => Promise.resolve(items[0]!.data["image/png"]).then(() => undefined))

const makeEnv = (write: ReturnType<typeof makeWrite>, overrides: Partial<ClipboardEnv> = {}) =>
  ({
    clipboard: { write: write as unknown as Clipboard["write"] },
    ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    isSecureContext: true,
    ...overrides,
  }) satisfies ClipboardEnv

const png = new Blob(["png-bytes"], { type: "image/png" })

describe("copyPNGToClipboard", () => {
  it("writes one image/png item whose data is the rendered blob", async () => {
    const write = makeWrite()
    await copyPNGToClipboard(() => Promise.resolve(png), makeEnv(write))
    expect(write).toHaveBeenCalledTimes(1)
    const items = write.mock.calls[0]![0]
    expect(items).toHaveLength(1)
    expect(Object.keys(items[0]!.data)).toEqual(["image/png"])
    await expect(Promise.resolve(items[0]!.data["image/png"])).resolves.toBe(png)
  })

  it("calls clipboard.write synchronously, before the PNG finishes rendering", async () => {
    const write = makeWrite()
    let finish!: (b: Blob) => void
    const rendering = new Promise<Blob>((resolve) => {
      finish = resolve
    })
    const done = copyPNGToClipboard(() => rendering, makeEnv(write))
    // No await yet: the write must already have been issued (user activation).
    expect(write).toHaveBeenCalledTimes(1)
    finish(png)
    await done
  })

  it.each([
    ["no Clipboard API", { clipboard: undefined }],
    ["no ClipboardItem", { ClipboardItem: undefined }],
    ["insecure context", { isSecureContext: false }],
  ] as const)("rejects with ClipboardUnsupportedError when %s, without rendering", async (_, o) => {
    const write = makeWrite()
    const render = vi.fn(() => Promise.resolve(png))
    await expect(copyPNGToClipboard(render, makeEnv(write, o))).rejects.toBeInstanceOf(
      ClipboardUnsupportedError,
    )
    expect(render).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it("propagates a permission rejection from clipboard.write", async () => {
    const denied = new DOMException("Write permission denied.", "NotAllowedError")
    const write = vi.fn<WriteFn>(() => Promise.reject(denied))
    await expect(copyPNGToClipboard(() => Promise.resolve(png), makeEnv(write))).rejects.toBe(
      denied,
    )
  })

  it("propagates a render failure", async () => {
    const boom = new Error("toBlob returned null")
    await expect(copyPNGToClipboard(() => Promise.reject(boom), makeEnv(makeWrite()))).rejects.toBe(
      boom,
    )
  })
})
