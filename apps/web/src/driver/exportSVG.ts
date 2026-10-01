"use client"
import { getFile } from "@excalidraw-clone/persistence"
import { renderToSVG } from "@excalidraw-clone/renderer"
import { Scene, type ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"

export type FileLoader = (id: string) => Promise<{ dataURL: string } | undefined>

/** Render exactly `elements` to an SVG string, embedding the image binaries
 *  they reference (loaded once per fileId). The elements are wrapped in a
 *  throwaway Scene, so any page or selection subset can be exported. */
export async function renderExportSVG(
  elements: readonly ExcalidrawElement[],
  opts: Pick<ExportOptions, "background">,
  canvasBg: string,
  loadFile: FileLoader = getFile,
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
  return renderToSVG(new Scene(live), { background, theme, files })
}
