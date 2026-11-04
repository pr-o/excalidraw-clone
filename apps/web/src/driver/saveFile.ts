"use client"
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
