"use client"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import { getElementsBounds, type Scene } from "@excalidraw-clone/scene"

export const THUMBNAIL_WIDTH = 46
export const THUMBNAIL_HEIGHT = 33
export const THUMBNAIL_CAPTURE_SCALE = 2

const PADDING = 4

export async function renderPageThumbnail(
  scene: Scene,
  canvasBg: string,
  theme: "light" | "dark",
): Promise<string | undefined> {
  const elements = scene.getElements()
  if (elements.length === 0) return undefined

  const bbox = getElementsBounds(elements)
  if (!bbox) return undefined
  const canvas = document.createElement("canvas")
  canvas.width = THUMBNAIL_WIDTH * THUMBNAIL_CAPTURE_SCALE
  canvas.height = THUMBNAIL_HEIGHT * THUMBNAIL_CAPTURE_SCALE

  const availW = canvas.width - PADDING * 2
  const availH = canvas.height - PADDING * 2
  const bboxW = Math.max(bbox.width, 1)
  const bboxH = Math.max(bbox.height, 1)
  const scale = Math.min(availW / bboxW, availH / bboxH, 1)
  const contentW = bboxW * scale
  const contentH = bboxH * scale
  const offsetX = PADDING + (availW - contentW) / 2
  const offsetY = PADDING + (availH - contentH) / 2
  const scrollX = offsetX / scale - bbox.x
  const scrollY = offsetY / scale - bbox.y

  const renderer = new CanvasRenderer(canvas, scene, {
    theme,
    canvasBg,
    viewTransform: { scrollX, scrollY, zoom: scale },
  })

  renderer.start()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  renderer.stop()

  return canvas.toDataURL("image/png")
}
