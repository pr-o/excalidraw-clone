"use client"
import {
  embedTextChunk,
  getFile,
  PNG_EXCALIDRAW_KEYWORD,
  serializeScene,
} from "@excalidraw-clone/persistence"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"

const PADDING = 20

const BG_FOR: Record<ExportOptions["background"], string> = {
  white: "#ffffff",
  dark: "#1e1e1e",
  transparent: "transparent",
}

export async function exportToPNG(scene: Scene, opts: ExportOptions): Promise<Blob> {
  const elements = scene.getElements()
  const bbox = computeBBox(elements)
  const w = Math.max(1, bbox.width + PADDING * 2)
  const h = Math.max(1, bbox.height + PADDING * 2)
  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(w * opts.scale)
  canvas.height = Math.floor(h * opts.scale)

  const renderer = new CanvasRenderer(canvas, scene, {
    theme: opts.background === "dark" ? "dark" : "light",
    viewTransform: { scrollX: -bbox.x + PADDING, scrollY: -bbox.y + PADDING, zoom: opts.scale },
  })

  const fileIds = new Set<string>()
  for (const el of elements) {
    if (el.type === "image" && el.fileId !== null) fileIds.add(el.fileId)
  }
  const loads: Promise<void>[] = []
  for (const id of fileIds) {
    const file = await getFile(id)
    if (file) loads.push(renderer.preloadImage(id, file.dataURL))
  }
  await Promise.all(loads)

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("exportToPNG: failed to acquire 2D context")
  if (opts.background === "transparent") {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  } else {
    ctx.fillStyle = BG_FOR[opts.background]
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

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
    const json = JSON.stringify(serializeScene(scene))
    return embedTextChunk(blob, PNG_EXCALIDRAW_KEYWORD, json)
  }
  return blob
}

function computeBBox(elements: ReturnType<Scene["getElements"]>): {
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
