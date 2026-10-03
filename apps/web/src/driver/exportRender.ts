"use client"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { exportToPDF } from "./exportPDF"
import { exportToPNG } from "./exportPNG"
import { renderExportSVG } from "./exportSVG"

export type RenderOptions = Pick<ExportOptions, "scale" | "background" | "embedScene">

/** Render exactly `elements` to a Blob in the given format, dispatching to
 *  the matching driver. The one place every export path — a single file or
 *  one entry of a zip — renders a page, so they can never drift apart. */
export async function renderPageBlob(
  format: ExportOptions["format"],
  elements: readonly ExcalidrawElement[],
  opts: RenderOptions,
  canvasBg: string,
  pageName: string,
): Promise<Blob> {
  if (format === "svg") {
    const svg = await renderExportSVG(elements, opts, canvasBg)
    return new Blob([svg], { type: "image/svg+xml" })
  }
  if (format === "pdf") return exportToPDF(elements, opts, canvasBg)
  return exportToPNG(elements, opts, canvasBg, pageName)
}
