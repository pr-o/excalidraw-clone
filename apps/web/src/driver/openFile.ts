"use client"
import {
  extractTextChunk,
  migrate,
  parseExcalidrawFile,
  PNG_EXCALIDRAW_KEYWORD,
  putFile,
} from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { ExcalidrawData, Scene } from "@excalidraw-clone/scene"

export async function openExcalidrawFromPicker(
  scene: Scene,
  renderer: CanvasRenderer | null,
): Promise<void> {
  const file = await pickFile(".excalidraw,.png,application/json,image/png")
  if (!file) return
  const data = await readSceneFromFile(file)
  if (!data) return
  scene.loadFromJSON(data)
  if (data.files) {
    for (const id of Object.keys(data.files)) {
      const f = data.files[id]!
      await putFile(f)
      renderer?.preloadImage(id, f.dataURL)
    }
  }
}

async function readSceneFromFile(file: File): Promise<ExcalidrawData | null> {
  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png")
  if (!isPng) return parseExcalidrawFile(file)

  const text = await extractTextChunk(file, PNG_EXCALIDRAW_KEYWORD)
  if (!text) {
    throw new Error("openFile: PNG has no embedded Excalidraw scene")
  }
  return migrate(JSON.parse(text))
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}
