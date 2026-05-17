"use client"
import { parseExcalidrawFile, putFile } from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"

export async function openExcalidrawFromPicker(
  scene: Scene,
  renderer: CanvasRenderer | null,
): Promise<void> {
  const file = await pickFile(".excalidraw,application/json")
  if (!file) return
  const data = await parseExcalidrawFile(file)
  scene.loadFromJSON(data)
  if (data.files) {
    for (const id of Object.keys(data.files)) {
      const f = data.files[id]!
      await putFile(f)
      renderer?.preloadImage(id, f.dataURL)
    }
  }
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
