"use client"

/** The browser surfaces copyPNGToClipboard needs; injectable for tests. */
export interface ClipboardEnv {
  clipboard: Pick<Clipboard, "write"> | undefined
  ClipboardItem: typeof ClipboardItem | undefined
  isSecureContext: boolean
}

export class ClipboardUnsupportedError extends Error {
  constructor() {
    super("Copying images to the clipboard is not supported in this browser or context")
    this.name = "ClipboardUnsupportedError"
  }
}

const browserEnv = (): ClipboardEnv => ({
  clipboard: typeof navigator === "undefined" ? undefined : navigator.clipboard,
  ClipboardItem: typeof ClipboardItem === "undefined" ? undefined : ClipboardItem,
  isSecureContext: typeof window !== "undefined" && window.isSecureContext,
})

/** Write a PNG to the system clipboard.
 *
 *  `render` is invoked and `clipboard.write` is called synchronously, before any
 *  await. The ClipboardItem holds the still-rendering Promise<Blob>, so the
 *  click's user activation is preserved (Safari requires this; Chromium
 *  accepts it). Always rejects, never throws synchronously, on failure:
 *  ClipboardUnsupportedError when the API or a secure context is missing,
 *  otherwise whatever the render or the write rejected with (e.g. a
 *  NotAllowedError DOMException). */
export async function copyPNGToClipboard(
  render: () => Promise<Blob>,
  env: ClipboardEnv = browserEnv(),
): Promise<void> {
  if (!env.isSecureContext || env.clipboard === undefined || env.ClipboardItem === undefined) {
    throw new ClipboardUnsupportedError()
  }
  const item = new env.ClipboardItem({ "image/png": render() })
  await env.clipboard.write([item])
}
