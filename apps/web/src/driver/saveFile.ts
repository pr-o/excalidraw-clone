"use client"
import {
  download,
  getAllFiles,
  serializeDocument,
  toExcalidrawBlob,
} from "@excalidraw-clone/persistence"
import type { ExcalidrawFiles } from "@excalidraw-clone/scene"
import type { PageRecord } from "./pages"

export async function saveAsExcalidraw(
  pages: readonly PageRecord[],
  activePageId: string,
  filename = "drawing.excalidraw",
): Promise<void> {
  const filesArr = await getAllFiles()
  const filesRecord = Object.fromEntries(filesArr.map((f) => [f.id, f])) as ExcalidrawFiles
  const data = serializeDocument(pages, activePageId, undefined, filesRecord)
  const blob = toExcalidrawBlob(data)
  download(blob, filename)
}
