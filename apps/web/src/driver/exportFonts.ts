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
/** Synthetic oblique faces (scripts/make-caveat-oblique.py; Caveat has no
 *  italic), split into the same subsets as the upright ones. */
const ITALIC_STEM = { regular: "/fonts/caveat-italic", bold: "/fonts/caveat-bolditalic" }
/** jsPDF only embeds TrueType, so the PDF path uses static TTFs. */
const TTF = {
  normal: "/fonts/caveat-regular.ttf",
  bold: "/fonts/caveat-bold.ttf",
  italic: "/fonts/caveat-italic.ttf",
  bolditalic: "/fonts/caveat-bolditalic.ttf",
} as const

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

/** Which italic Caveat faces the hand-drawn text needs (upright weights come
 *  from the variable latin subsets). */
export function handwrittenItalics(elements: readonly ExcalidrawElement[]): {
  regular: boolean
  bold: boolean
} {
  const need = { regular: false, bold: false }
  const mark = (bold: boolean): void => {
    need[bold ? "bold" : "regular"] = true
  }
  for (const e of elements) {
    if (e.isDeleted || !("fontFamily" in e) || e.fontFamily !== HANDWRITTEN) continue
    if (e.type === "text") {
      const bold = e.fontWeight === "bold"
      if (e.fontStyle === "italic") mark(bold)
      for (const s of e.spans ?? [])
        if (s.italic || e.fontStyle === "italic") mark(bold || !!s.bold)
    } else if (e.type === "table") {
      e.cellSpans?.forEach((row, r) =>
        row.forEach((spans) => {
          for (const s of spans ?? []) if (s.italic) mark(!!s.bold || (e.headerRow && r === 0))
        }),
      )
    }
  }
  return need
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
  const italics = handwrittenItalics(elements)
  const italicFaces = (["regular", "bold"] as const)
    .filter((weight) => italics[weight])
    .flatMap((weight) =>
      subsets.map(({ url, range }) => ({
        url: url.replace("/fonts/caveat", ITALIC_STEM[weight]),
        rule: `font-style:italic;font-weight:${weight === "bold" ? 700 : 400};unicode-range:${range};`,
      })),
    )
  const faces = [
    ...subsets.map(({ url, range }) => ({
      url,
      rule: `font-weight:400 700;unicode-range:${range};`,
    })),
    ...italicFaces,
  ]
  const rules = await Promise.all(
    faces.map(async ({ url, rule }) => {
      const data = toBase64(await fetchFont(url))
      return `@font-face{font-family:"Caveat";${rule}src:url(data:font/woff2;base64,${data}) format("woff2");}`
    }),
  )
  return rules.join("")
}

/** The slice of jsPDF used to register a TrueType font. */
export interface FontRegistry {
  addFileToVFS: (name: string, base64: string) => unknown
  addFont: (file: string, family: string, style: string) => unknown
  setFont: (family: string, style: string) => unknown
  getFont: () => { metadata?: unknown; fontName: string; fontStyle: string }
}

/** The parsed-TTF fields jsPDF writes into a font's PDF descriptor. */
interface TtfMetadata {
  italicAngle: number
  flags: number
  post: { italicAngle: number }
}

/** jsPDF 4.2.1 reads `post.italic_angle` while its TTF parser stores
 *  `post.italicAngle`, so every embedded font gets `/ItalicAngle 0`. Copy the
 *  real angle (16.16 fixed point) and set the descriptor's Italic flag. */
function fixItalicAngle(pdf: FontRegistry, style: string): void {
  const prev = pdf.getFont()
  pdf.setFont("Caveat", style)
  const meta = pdf.getFont().metadata as TtfMetadata | undefined
  // Leave jsPDF's current font as svg2pdf expects to find it.
  pdf.setFont(prev.fontName, prev.fontStyle)
  if (!meta || meta.italicAngle !== 0 || !meta.post.italicAngle) return
  meta.italicAngle = meta.post.italicAngle / 65536
  meta.flags |= 1 << 6
}

/** True when a parsed export SVG draws any text in Caveat. */
export const svgUsesHandwritten = (root: Element): boolean =>
  root.querySelector('[font-family*="Caveat"]') !== null

/** True when a parsed export SVG draws any italic text. */
export const svgUsesItalic = (root: Element): boolean =>
  root.querySelector('[font-style="italic"]') !== null

/** Register Caveat's four faces with jsPDF so svg2pdf draws hand-drawn text in
 *  Caveat rather than its Times fallback. The (synthetic oblique) italic faces
 *  are only fetched when `withItalic` (some page has italic text). */
export async function registerHandwrittenFont(
  pdf: FontRegistry,
  withItalic: boolean,
  fetchFont: FontFetcher = defaultFetcher,
): Promise<void> {
  const styles = withItalic
    ? (["normal", "bold", "italic", "bolditalic"] as const)
    : (["normal", "bold"] as const)
  const files = await Promise.all(styles.map((style) => fetchFont(TTF[style])))
  styles.forEach((style, i) => {
    const file = `caveat-${style}.ttf`
    pdf.addFileToVFS(file, toBase64(files[i]!))
    pdf.addFont(file, "Caveat", style)
    if (style.endsWith("italic")) fixItalicAngle(pdf, style)
  })
}
