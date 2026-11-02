"use client"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** The hand-drawn family (FontFamily 1); its files are self-hosted under /fonts. */
const HANDWRITTEN = 1

// Same subsets and ranges as the @font-face rules in globals.css.
const WOFF2_LATIN = {
  url: "/fonts/caveat-latin.woff2",
  range:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
}
const WOFF2_LATIN_EXT = {
  url: "/fonts/caveat-latin-ext.woff2",
  range:
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
}
/** jsPDF only embeds TrueType, so the PDF path uses static TTFs. */
const TTF = { regular: "/fonts/caveat-regular.ttf", bold: "/fonts/caveat-bold.ttf" }

/** All text drawn in the hand-drawn font, or null when there is none. */
export function handwrittenText(elements: readonly ExcalidrawElement[]): string | null {
  const parts: string[] = []
  for (const e of elements) {
    if (e.isDeleted || !("fontFamily" in e) || e.fontFamily !== HANDWRITTEN) continue
    if (e.type === "text") parts.push(e.text)
    else if (e.type === "table") parts.push(e.cells.flat().join(""))
  }
  return parts.length > 0 ? parts.join("") : null
}

export type FontFetcher = (url: string) => Promise<ArrayBuffer>

const defaultFetcher: FontFetcher = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`could not load ${url}: ${res.status}`)
  return res.arrayBuffer()
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** `@font-face` CSS embedding Caveat as base64 woff2 for a standalone SVG, or
 *  undefined when no element uses it (so plain exports stay small). The
 *  latin-ext subset is only added when the text needs characters beyond Latin-1. */
export async function handwrittenFontFaceCSS(
  elements: readonly ExcalidrawElement[],
  fetchFont: FontFetcher = defaultFetcher,
): Promise<string | undefined> {
  const text = handwrittenText(elements)
  if (text === null) return undefined
  // eslint-disable-next-line no-control-regex
  const subsets = /[^\u0000-ÿ]/.test(text) ? [WOFF2_LATIN_EXT, WOFF2_LATIN] : [WOFF2_LATIN]
  const rules = await Promise.all(
    subsets.map(async ({ url, range }) => {
      const data = toBase64(await fetchFont(url))
      return `@font-face{font-family:"Caveat";font-weight:400 700;src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${range};}`
    }),
  )
  return rules.join("")
}

/** The slice of jsPDF used to register a TrueType font. */
export interface FontRegistry {
  addFileToVFS: (name: string, base64: string) => unknown
  addFont: (file: string, family: string, style: string) => unknown
}

/** True when a parsed export SVG draws any text in Caveat. */
export const svgUsesHandwritten = (root: Element): boolean =>
  root.querySelector('[font-family*="Caveat"]') !== null

/** Register Caveat with jsPDF so svg2pdf draws that text in Caveat rather
 *  than its Times fallback. Caveat has no italic: italic reuses the upright faces. */
export async function registerHandwrittenFont(
  pdf: FontRegistry,
  fetchFont: FontFetcher = defaultFetcher,
): Promise<void> {
  const [regular, bold] = await Promise.all([fetchFont(TTF.regular), fetchFont(TTF.bold)])
  pdf.addFileToVFS("caveat-regular.ttf", toBase64(regular))
  pdf.addFileToVFS("caveat-bold.ttf", toBase64(bold))
  for (const [file, styles] of [
    ["caveat-regular.ttf", ["normal", "italic"]],
    ["caveat-bold.ttf", ["bold", "bolditalic"]],
  ] as const) {
    for (const style of styles) pdf.addFont(file, "Caveat", style)
  }
}
