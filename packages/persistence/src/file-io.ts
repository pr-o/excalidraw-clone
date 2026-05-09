import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawData,
  ExcalidrawFiles,
  Scene,
} from "@excalidraw-clone/scene"
import { migrate } from "./migrations"

export function serializeScene(
  scene: Scene,
  appState?: ExcalidrawAppStateSnapshot,
  files?: ExcalidrawFiles,
): ExcalidrawData {
  return scene.toJSON(appState, files)
}

export function toExcalidrawBlob(data: ExcalidrawData): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function parseExcalidrawFile(file: File): Promise<ExcalidrawData> {
  let text: string
  try {
    text = await file.text()
  } catch (err) {
    throw new Error(`parseExcalidrawFile: failed to read file: ${String(err)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("parseExcalidrawFile: failed to parse JSON")
  }
  return migrate(parsed)
}
