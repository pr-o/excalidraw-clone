import { beforeEach, describe, expect, it, vi } from "vitest"
import { prepareSVGForPDF, svgToPDF } from "../src/driver/exportPDF"

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
  svg2pdf.mockClear()
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
