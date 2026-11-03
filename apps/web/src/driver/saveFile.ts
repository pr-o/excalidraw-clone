"use client"
import {
  download,
  getAllFiles,
  serializeDocument,
  toExcalidrawBlob,
} from "@excalidraw-clone/persistence"
import type { ExcalidrawFiles } from "@excalidraw-clone/scene"
import type { PageRecord } from "./pages"

/** Ids of the image binaries the document's elements point at (deleted elements
 *  included: they stay in the file, so undo history round-trips). */
export function referencedFileIds(pages: readonly Pick<PageRecord, "scene">[]): Set<string> {
  const ids = new Set<string>()
  for (const page of pages) {
    for (const el of page.scene.getElementsIncludingDeleted()) {
      if (el.type === "image" && el.fileId !== null) ids.add(el.fileId)
    }
  }
  return ids
}

export async function saveAsExcalidraw(
  pages: readonly PageRecord[],
  activePageId: string,
  filename = "drawing.excalidraw",
): Promise<void> {
  // Only the images this document uses: the browser store also holds pictures from
  // deleted elements and other drawings, which must not leak into a shared file.
  const used = referencedFileIds(pages)
  const filesArr = (await getAllFiles()).filter((f) => used.has(f.id))
  const filesRecord = Object.fromEntries(filesArr.map((f) => [f.id, f])) as ExcalidrawFiles
  const data = serializeDocument(pages, activePageId, undefined, filesRecord)
  const blob = toExcalidrawBlob(data)
  download(blob, filename)
}
