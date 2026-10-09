import { beforeEach, describe, expect, it, vi } from "vitest"
import { prepareSVGForPDF, svgsToPDF, svgToPDF } from "../src/driver/exportPDF"

// svg2pdf.js needs a real layout engine (SVGElement.getBBox), which jsdom
// lacks, and its UMD "main" build cannot even be imported under Vitest. It is
// mocked here; the real drawing is covered by e2e/export.spec.ts. jsPDF itself
// runs fine under jsdom, so the page geometry below is real.
const svg2pdf = vi.hoisted(() =>
  vi.fn((_el: Element, pdf: unknown, _opts?: unknown) => Promise.resolve(pdf)),
)
vi.mock("svg2pdf.js", () => ({ svg2pdf }))

const svgOf = (w: number, h: number, body = ""): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-20 -20 ${w} ${h}">${body}</svg>`

const pdfText = async (blob: Blob): Promise<string> =>
  new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()))

beforeEach(() => {
  svg2pdf.mockReset()
  svg2pdf.mockImplementation((_el, pdf) => Promise.resolve(pdf))
})

describe("prepareSVGForPDF", () => {
  it("reads the page size from the SVG's own width/height", () => {
    const { root, width, height } = prepareSVGForPDF(svgOf(440, 320))
    expect(root.localName).toBe("svg")
    expect(width).toBe(440)
    expect(height).toBe(320)
  })

  it("adds alignment-baseline=text-top to top-aligned text only", () => {
    const { root } = prepareSVGForPDF(
      svgOf(
        100,
        100,
        '<text dominant-baseline="text-before-edge"><tspan x="0" y="0">a</tspan></text><text><tspan>b</tspan></text>',
      ),
    )
    const [top, plain] = Array.from(root.getElementsByTagName("text"))
    expect(top?.getAttribute("alignment-baseline")).toBe("text-top")
    expect(plain?.hasAttribute("alignment-baseline")).toBe(false)
  })

  it("throws on malformed SVG", () => {
    expect(() => prepareSVGForPDF("<svg")).toThrow(/could not parse/)
  })

  it("throws when the root has no positive size", () => {
    expect(() => prepareSVGForPDF('<svg xmlns="http://www.w3.org/2000/svg"/>')).toThrow(/no size/)
  })
})

describe("svgToPDF", () => {
  it("produces a one-page PDF whose page is exactly the SVG size (landscape)", async () => {
    const blob = await svgToPDF(svgOf(440, 320))
    expect(blob.type).toBe("application/pdf")
    const text = await pdfText(blob)
    expect(text.startsWith("%PDF-")).toBe(true)
    expect(text).toMatch(/\/MediaBox \[0 0 440\.? 320\.?\]/)
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1)
  })

  it("keeps a tall page tall (portrait)", async () => {
    const text = await pdfText(await svgToPDF(svgOf(100, 300)))
    expect(text).toMatch(/\/MediaBox \[0 0 100\.? 300\.?\]/)
  })

  it("draws the parsed root at the origin, full page size", async () => {
    await svgToPDF(svgOf(140, 90))
    expect(svg2pdf).toHaveBeenCalledTimes(1)
    const [el, , opts] = svg2pdf.mock.calls[0]!
    expect(el.localName).toBe("svg")
    expect(opts).toEqual({ x: 0, y: 0, width: 140, height: 90 })
  })

  it("rejects when svg2pdf rejects", async () => {
    svg2pdf.mockRejectedValueOnce(new Error("boom"))
    await expect(svgToPDF(svgOf(10, 10))).rejects.toThrow("boom")
  })
})

describe("svgsToPDF", () => {
  it("gives every page its own size, landscape and portrait mixed", async () => {
    const blob = await svgsToPDF([svgOf(440, 320), svgOf(100, 300)])
    expect(blob.type).toBe("application/pdf")
    const text = await pdfText(blob)
    expect(text.startsWith("%PDF-")).toBe(true)
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2)
    const boxes = [...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ])
    // In page order; the second page must NOT inherit the first's landscape
    // orientation (which would swap it to 300×100).
    expect(boxes).toEqual([
      [440, 320],
      [100, 300],
    ])
  })

  it("a single SVG still makes exactly one page", async () => {
    const text = await pdfText(await svgsToPDF([svgOf(140, 90)]))
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1)
    expect(text).toMatch(/\/MediaBox \[0 0 140\.? 90\.?\]/)
  })

  it("draws each SVG once, onto its own page, at full page size", async () => {
    const drawnOnPage: number[] = []
    svg2pdf.mockImplementation((_el, pdf) => {
      drawnOnPage.push(
        (pdf as { getCurrentPageInfo(): { pageNumber: number } }).getCurrentPageInfo().pageNumber,
      )
      return Promise.resolve(pdf)
    })
    await svgsToPDF([svgOf(440, 320), svgOf(100, 300), svgOf(250, 250)])
    expect(drawnOnPage).toEqual([1, 2, 3])
    expect(svg2pdf).toHaveBeenCalledTimes(3)
    const calls = svg2pdf.mock.calls
    expect(calls.map(([el]) => [el.localName, el.getAttribute("width")])).toEqual([
      ["svg", "440"],
      ["svg", "100"],
      ["svg", "250"],
    ])
    expect(calls.map(([, , opts]) => opts)).toEqual([
      { x: 0, y: 0, width: 440, height: 320 },
      { x: 0, y: 0, width: 100, height: 300 },
      { x: 0, y: 0, width: 250, height: 250 },
    ])
    // One shared document, not one per page.
    expect(new Set(calls.map(([, pdf]) => pdf)).size).toBe(1)
  })

  it("rejects an empty list", async () => {
    await expect(svgsToPDF([])).rejects.toThrow(/no pages/)
  })

  it("rejects when svg2pdf rejects on a later page", async () => {
    svg2pdf.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"))
    await expect(svgsToPDF([svgOf(10, 10), svgOf(20, 20)])).rejects.toThrow("boom")
  })
})
