"use client"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { renderPageBlob, type RenderOptions } from "./exportRender"
import { exportFilename } from "./exportTarget"
import type { PageRecord } from "./pages"

export type ZipOptions = RenderOptions & Pick<ExportOptions, "format">

/** Export every page as its own file, named like a single-page export,
 *  bundled into one uncompressed .zip. Same-named pages (after
 *  exportFilename's sanitizing) are disambiguated with " (2)", " (3)", etc.
 *  before the extension, in page order. jszip is loaded on first use. */
export async function buildExportZip(
  pages: readonly Pick<PageRecord, "name" | "scene">[],
  opts: ZipOptions,
  canvasBg: string,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  const used = new Set<string>()
  for (const page of pages) {
    const blob = await renderPageBlob(
      opts.format,
      page.scene.getElements(),
      opts,
      canvasBg,
      page.name,
    )
    zip.file(uniqueName(exportFilename(page.name, "page", opts.format), used), blob)
  }
  return zip.generateAsync({ type: "blob" })
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf(".")
  const base = dot === -1 ? name : name.slice(0, dot)
  const ext = dot === -1 ? "" : name.slice(dot)
  let i = 2
  let candidate = `${base} (${i})${ext}`
  while (used.has(candidate)) {
    i += 1
    candidate = `${base} (${i})${ext}`
  }
  used.add(candidate)
  return candidate
}
