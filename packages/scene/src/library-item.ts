import type { ExcalidrawBinaryFile, ExcalidrawElement } from "./types"

export interface LibraryItem {
  id: string
  name: string
  created: number
  elements: ExcalidrawElement[]
  files?: Record<string, ExcalidrawBinaryFile>
}
