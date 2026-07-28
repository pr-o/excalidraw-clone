import {
  buildExcalidrawData,
  type ExcalidrawAppStateSnapshot,
  type ExcalidrawData,
  type ExcalidrawFiles,
  type Scene,
} from "@excalidraw-clone/scene"
import { migrate } from "./migrations"

export interface DocumentPage {
  id: string
  name: string
  scene: Scene
}

export function serializeDocument(
  pages: readonly DocumentPage[],
  activePageId: string,
  appState?: ExcalidrawAppStateSnapshot,
  files?: ExcalidrawFiles,
): ExcalidrawData {
  const pageData = pages.map((p) => ({
    id: p.id,
    name: p.name,
    elements: p.scene.getElementsIncludingDeleted(),
  }))
  return buildExcalidrawData(pageData, activePageId, appState, files)
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
