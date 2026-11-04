"use client"
import {
  extractTextChunk,
  migrate,
  parseExcalidrawFile,
  PNG_EXCALIDRAW_KEYWORD,
  putFile,
} from "@excalidraw-clone/persistence"
import { preloadSharedImage } from "@excalidraw-clone/renderer"
import type { ExcalidrawData } from "@excalidraw-clone/scene"

export async function openExcalidrawFromPicker(): Promise<ExcalidrawData | null> {
  const file = await pickFile(".excalidraw,.png,application/json,image/png")
  return file ? openSceneFile(file) : null
}

/** Reads a `.excalidraw` file (or a PNG with an embedded scene), stores the images
 *  it carries and decodes them for drawing. Throws when the file is not a scene. */
export async function openSceneFile(file: File): Promise<ExcalidrawData | null> {
  const data = await readSceneFromFile(file)
  if (!data) return null
  for (const f of Object.values(data.files ?? {})) {
    await putFile(f)
    void preloadSharedImage(f.id, f.dataURL)
  }
  return data
}

/** True for a PNG exported with "Embed scene" (it can be opened as a drawing). */
export async function pngHasEmbeddedScene(file: Blob): Promise<boolean> {
  return (await extractTextChunk(file, PNG_EXCALIDRAW_KEYWORD).catch(() => null)) !== null
}

async function readSceneFromFile(file: File): Promise<ExcalidrawData | null> {
  const name = file.name.toLowerCase()
  const isPng = file.type === "image/png" || name.endsWith(".png")
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
    // Dismissing the dialog fires `cancel`, not `change`; without this the promise never settles.
    input.oncancel = () => resolve(null)
    input.click()
  })
}
