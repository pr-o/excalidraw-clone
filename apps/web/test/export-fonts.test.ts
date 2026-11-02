import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { newRectangle, newText } from "@excalidraw-clone/scene"
import type { jsPDF } from "jspdf"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  handwrittenFontFaceCSS,
  handwrittenItalics,
  handwrittenText,
} from "../src/driver/exportFonts"
import { svgToPDF } from "../src/driver/exportPDF"
import { type FileLoader, renderExportSVG } from "../src/driver/exportSVG"

const svg2pdf = vi.hoisted(() =>
  vi.fn((_el: Element, pdf: unknown, _opts?: unknown) => Promise.resolve(pdf)),
)
vi.mock("svg2pdf.js", () => ({ svg2pdf }))

const noFiles: FileLoader = () => Promise.resolve(undefined)
const fontsDir = resolve(__dirname, "../public/fonts")

/** Serves /fonts/* from apps/web/public, like the dev server would. */
function stubFontFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    const bytes = readFileSync(resolve(fontsDir, url.replace("/fonts/", "")))
    return Promise.resolve(new Response(new Uint8Array(bytes)))
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  svg2pdf.mockClear()
})

const caveat = (text: string) => newText({ x: 0, y: 0, text, fontFamily: 1 })
const helvetica = (text: string) => newText({ x: 0, y: 0, text, fontFamily: 2 })

describe("handwrittenText", () => {
  it("collects only text drawn in the hand-drawn family", () => {
    expect(handwrittenText([caveat("hi"), helvetica("no")])).toBe("hi")
    expect(handwrittenText([helvetica("no"), newRectangle({ x: 0, y: 0 })])).toBeNull()
  })
})

describe("handwrittenItalics", () => {
  it("finds the italic faces whole-element and span styles need", () => {
    const plain = caveat("up")
    const italic = { ...caveat("it"), fontStyle: "italic" as const }
    const boldSpan = {
      ...caveat("abc"),
      spans: [{ start: 0, end: 1, bold: true as const, italic: true as const }],
    }
    expect(handwrittenItalics([plain])).toEqual({ regular: false, bold: false })
    expect(handwrittenItalics([italic])).toEqual({ regular: true, bold: false })
    expect(handwrittenItalics([boldSpan])).toEqual({ regular: false, bold: true })
    // Italic in another family needs no Caveat italic.
    expect(handwrittenItalics([{ ...helvetica("x"), fontStyle: "italic" as const }])).toEqual({
      regular: false,
      bold: false,
    })
  })
})

describe("SVG export font embedding", () => {
  it("embeds the oblique face, as font-style italic, for italic hand-drawn text", async () => {
    const fetchMock = stubFontFetch()
    const italic = { ...caveat("slanted"), fontStyle: "italic" as const }
    const svg = await renderExportSVG([italic], { background: "white" }, "#fff", noFiles)
    // Latin-1 text: only the latin subset of the regular oblique face.
    expect(fetchMock.mock.calls.map((call) => String(call[0])).sort()).toEqual([
      "/fonts/caveat-italic-latin.woff2",
      "/fonts/caveat-latin.woff2",
    ])
    expect(svg).toContain(
      'font-family:"Caveat";font-style:italic;font-weight:400;unicode-range:U+0000-00FF',
    )
    expect(svg).toContain('font-style="italic"')
  })

  it("adds the oblique latin-ext subset only for italic text beyond Latin-1", async () => {
    const fetchMock = stubFontFetch()
    const italic = { ...caveat("Łódź"), fontStyle: "italic" as const, fontWeight: "bold" as const }
    await handwrittenFontFaceCSS([italic])
    expect(fetchMock).toHaveBeenCalledWith("/fonts/caveat-bolditalic-latin-ext.woff2")
    expect(fetchMock).toHaveBeenCalledWith("/fonts/caveat-bolditalic-latin.woff2")
    expect(fetchMock).not.toHaveBeenCalledWith("/fonts/caveat-italic-latin.woff2")
  })

  it("embeds Caveat as base64 woff2 in <defs><style> when hand-drawn text is present", async () => {
    const fetchMock = stubFontFetch()
    const svg = await renderExportSVG([caveat("Hello")], { background: "white" }, "#fff", noFiles)
    expect(svg).toMatch(/<defs><style>@font-face\{font-family:"Caveat"/)
    expect(svg).toContain("data:font/woff2;base64,")
    // Latin-1 text only needs the latin subset.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/fonts/caveat-latin.woff2")
  })

  it("adds the latin-ext subset only for text beyond Latin-1", async () => {
    const fetchMock = stubFontFetch()
    const css = await handwrittenFontFaceCSS([caveat("Łódź")])
    expect(fetchMock).toHaveBeenCalledWith("/fonts/caveat-latin-ext.woff2")
    expect(css?.match(/@font-face/g)).toHaveLength(2)
  })

  it("adds nothing (and fetches nothing) without hand-drawn text", async () => {
    const fetchMock = stubFontFetch()
    const svg = await renderExportSVG(
      [helvetica("plain"), newRectangle({ x: 0, y: 0, width: 10, height: 10 })],
      { background: "white" },
      "#fff",
      noFiles,
    )
    expect(svg).not.toContain("@font-face")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("leaves the font out of the SVG that feeds the PDF path", async () => {
    const fetchMock = stubFontFetch()
    const svg = await renderExportSVG(
      [caveat("Hi")],
      { background: "white" },
      "#fff",
      noFiles,
      false,
    )
    expect(svg).not.toContain("@font-face")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("PDF export font registration", () => {
  const svgWith = (family: string, style = "normal") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><text font-family='${family}' font-style='${style}'>Hi</text></svg>`

  it("registers upright Caveat faces only when no text is italic", async () => {
    const fetchMock = stubFontFetch()
    await svgToPDF(svgWith('"Caveat", cursive'))
    const pdf = svg2pdf.mock.calls[0]![1] as jsPDF
    expect(pdf.getFontList().Caveat?.sort()).toEqual(["bold", "normal"])
    expect(fetchMock).toHaveBeenCalledWith("/fonts/caveat-regular.ttf")
    expect(fetchMock).not.toHaveBeenCalledWith("/fonts/caveat-italic.ttf")
  })

  it("registers the synthetic oblique faces for italic hand-drawn text", async () => {
    const fetchMock = stubFontFetch()
    await svgToPDF(svgWith('"Caveat", cursive', "italic"))
    const pdf = svg2pdf.mock.calls[0]![1] as jsPDF
    expect(pdf.getFontList().Caveat?.sort()).toEqual(["bold", "bolditalic", "italic", "normal"])
    expect(fetchMock).toHaveBeenCalledWith("/fonts/caveat-italic.ttf")
    expect(fetchMock).toHaveBeenCalledWith("/fonts/caveat-bolditalic.ttf")
  })

  it("fetches no font for a PDF without hand-drawn text", async () => {
    const fetchMock = stubFontFetch()
    await svgToPDF(svgWith("Helvetica, sans-serif"))
    const pdf = svg2pdf.mock.calls[0]![1] as jsPDF
    expect(pdf.getFontList().Caveat).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
