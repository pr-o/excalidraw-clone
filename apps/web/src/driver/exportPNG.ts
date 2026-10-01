"use client"
import { embedTextChunk, getFile, PNG_EXCALIDRAW_KEYWORD } from "@excalidraw-clone/persistence"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import {
  buildExcalidrawData,
  newPage,
  Scene,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"

const PADDING = 20

export type PNGRenderOptions = Pick<ExportOptions, "scale" | "background" | "embedScene">

/** Render exactly `elements` to a PNG blob sized to their bounding box plus
 *  padding. The elements are wrapped in a throwaway Scene, so any page or
 *  selection subset can be exported without touching the live canvas. When
 *  `embedScene` is set, the embedded document holds only these elements, as a
 *  single page named `pageName`. */
export async function exportToPNG(
  elements: readonly ExcalidrawElement[],
  opts: PNGRenderOptions,
  canvasBg = "#ffffff",
  pageName = "Page 1",
): Promise<Blob> {
  const live = elements.filter((e) => !e.isDeleted)
  const scene = new Scene(live)
  const bbox = computeBBox(live)
  const w = Math.max(1, bbox.width + PADDING * 2)
  const h = Math.max(1, bbox.height + PADDING * 2)
  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(w * opts.scale)
  canvas.height = Math.floor(h * opts.scale)

  const renderer = new CanvasRenderer(canvas, scene, {
    theme: opts.background === "dark" ? "dark" : "light",
    canvasBg: opts.background === "transparent" ? "transparent" : canvasBg,
    viewTransform: { scrollX: -bbox.x + PADDING, scrollY: -bbox.y + PADDING, zoom: opts.scale },
  })

  const fileIds = new Set<string>()
  for (const el of live) {
    if (el.type === "image" && el.fileId !== null) fileIds.add(el.fileId)
  }
  const loads: Promise<void>[] = []
  for (const id of fileIds) {
    const file = await getFile(id)
    if (file) loads.push(renderer.preloadImage(id, file.dataURL))
  }
  await Promise.all(loads)

  renderer.start()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  renderer.stop()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error("exportToPNG: toBlob returned null"))
    }, "image/png")
  })

  if (opts.embedScene) {
    const page = newPage(pageName, live)
    const json = JSON.stringify(buildExcalidrawData([page], page.id))
    return embedTextChunk(blob, PNG_EXCALIDRAW_KEYWORD, json)
  }
  return blob
}

function computeBBox(elements: readonly ExcalidrawElement[]): {
  x: number
  y: number
  width: number
  height: number
} {
  if (elements.length === 0) return { x: 0, y: 0, width: 100, height: 100 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
