"use client"
import { getFile } from "@excalidraw-clone/persistence"
import { renderToSVG } from "@excalidraw-clone/renderer"
import { Scene, type ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { handwrittenFontFaceCSS } from "./exportFonts"

export type FileLoader = (id: string) => Promise<{ dataURL: string } | undefined>

/** Render exactly `elements` to an SVG string, embedding the image binaries
 *  they reference (loaded once per fileId) and, when any text uses it, the
 *  Caveat font. The elements are wrapped in a throwaway Scene, so any page or
 *  selection subset can be exported. `embedFonts: false` is for the PDF path,
 *  which registers fonts with jsPDF instead. */
export async function renderExportSVG(
  elements: readonly ExcalidrawElement[],
  opts: Pick<ExportOptions, "background">,
  canvasBg: string,
  loadFile: FileLoader = getFile,
  embedFonts = true,
): Promise<string> {
  const theme = opts.background === "dark" ? "dark" : "light"
  const background = opts.background === "transparent" ? "transparent" : canvasBg
  const live = elements.filter((e) => !e.isDeleted)
  const files = new Map<string, string>()
  for (const el of live) {
    if (el.type === "image" && el.fileId !== null && !files.has(el.fileId)) {
      const bin = await loadFile(el.fileId)
      if (bin) files.set(el.fileId, bin.dataURL)
    }
  }
  const fontFaceCSS = embedFonts ? await handwrittenFontFaceCSS(live) : undefined
  return renderToSVG(new Scene(live), {
    background,
    theme,
    files,
    ...(fontFaceCSS ? { fontFaceCSS } : {}),
  })
}
