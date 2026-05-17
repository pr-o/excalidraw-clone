"use client"
import type { Point } from "@excalidraw-clone/geometry"
import { addImageFromBlob } from "@excalidraw-clone/persistence"

export interface ImageReadyPayload {
  type: "imageReady"
  fileId: string
  mimeType: string
  width: number
  height: number
  at: Point
}

export async function pickAndUploadImage(at: Point): Promise<ImageReadyPayload | null> {
  const blob = await pickImageBlob()
  if (!blob) return null
  const file = await addImageFromBlob(blob)
  const dims = await measureImage(file.dataURL)
  return {
    type: "imageReady",
    fileId: file.id,
    mimeType: file.mimeType,
    width: dims.width,
    height: dims.height,
    at,
  }
}

function pickImageBlob(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/png,image/jpeg,image/webp,image/svg+xml"
    input.onchange = () => {
      const f = input.files?.[0]
      resolve(f ?? null)
    }
    input.click()
  })
}

function measureImage(dataURL: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error("measureImage: image load failed"))
    img.src = dataURL
  })
}
