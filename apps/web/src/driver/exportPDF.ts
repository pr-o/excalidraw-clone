"use client"
import { getFile } from "@excalidraw-clone/persistence"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { renderExportSVG, type FileLoader } from "./exportSVG"

const SVG_NS = "http://www.w3.org/2000/svg"

/** A parsed export SVG, ready for svg2pdf. */
export interface PreparedSVG {
  root: Element
  /** The SVG's own width/height attributes: the content bbox plus padding,
   *  exactly as renderToSVG sized it. */
  width: number
  height: number
}

/** Parse renderExportSVG output and patch what svg2pdf cannot read.
 *
 *  renderToSVG top-aligns text with `dominant-baseline="text-before-edge"`,
 *  which svg2pdf ignores (it would draw every line one ascent too high); the
 *  equivalent `alignment-baseline="text-top"` is added for it. Throws on
 *  malformed input or a root without a positive width/height. */
export function prepareSVGForPDF(svg: string): PreparedSVG {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  const root = doc.documentElement
  if (root.namespaceURI !== SVG_NS || root.localName !== "svg") {
    throw new Error("exportToPDF: could not parse the export SVG")
  }
  const width = Number(root.getAttribute("width"))
  const height = Number(root.getAttribute("height"))
  if (!(width > 0) || !(height > 0)) {
    throw new Error("exportToPDF: the export SVG has no size")
  }
  for (const text of Array.from(root.getElementsByTagNameNS(SVG_NS, "text"))) {
    if (text.getAttribute("dominant-baseline") === "text-before-edge") {
      text.setAttribute("alignment-baseline", "text-top")
    }
  }
  return { root, width, height }
}

/** Draw an export SVG onto a single PDF page of exactly its own size
 *  (1 SVG unit = 1 pt). jsPDF and svg2pdf.js are loaded on first use. */
export async function svgToPDF(svg: string): Promise<Blob> {
  const { root, width, height } = prepareSVGForPDF(svg)
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")])
  // jsPDF swaps [w, h] to match `orientation` (default portrait), so a wide
  // page must be declared landscape or it comes out rotated.
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "pt",
    format: [width, height],
    compress: true,
    putOnlyUsedFonts: true,
  })
  await svg2pdf(root, pdf, { x: 0, y: 0, width, height })
  return pdf.output("blob")
}

/** Render exactly `elements` to a one-page PDF sized like the PNG/SVG export
 *  (content bounding box plus the same 20px padding). Vector output: there is
 *  no scale. Text uses the PDF standard fonts (Helvetica/Times/Courier). */
export async function exportToPDF(
  elements: readonly ExcalidrawElement[],
  opts: Pick<ExportOptions, "background">,
  canvasBg: string,
  loadFile: FileLoader = getFile,
): Promise<Blob> {
  return svgToPDF(await renderExportSVG(elements, opts, canvasBg, loadFile))
}
