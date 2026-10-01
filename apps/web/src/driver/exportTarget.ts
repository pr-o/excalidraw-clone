import { expandIdsToCopyClosure, type ExcalidrawElement } from "@excalidraw-clone/scene"
import type { PageRecord } from "./pages"

export type ExportScope = "page" | "selection"

/** What an export actually renders, after every fallback has been applied. */
export interface ExportTarget {
  elements: readonly ExcalidrawElement[]
  pageName: string
  /** The effective scope: "selection" only if a non-empty selection was used. */
  scope: ExportScope
}

/** Resolve the elements to export.
 *
 *  - The requested page is used; an unknown id falls back to the active page.
 *  - "selection" applies only to the active page (selection is page-local) and
 *    only when the selection's copy closure is non-empty; otherwise the whole
 *    page is exported and the effective scope is "page".
 *  - The selection closure brings bound labels and frame members along and
 *    keeps scene (z) order, exactly like copy/duplicate. */
export function resolveExportTarget(
  pages: readonly Pick<PageRecord, "id" | "name" | "scene">[],
  activePageId: string,
  selectedIds: readonly string[],
  request: { pageId: string; scope: ExportScope },
): ExportTarget {
  const page =
    pages.find((p) => p.id === request.pageId) ??
    pages.find((p) => p.id === activePageId) ??
    pages[0]
  if (!page) return { elements: [], pageName: "", scope: "page" }
  const all = page.scene.getElements()
  if (request.scope === "selection" && page.id === activePageId) {
    const closure = expandIdsToCopyClosure(selectedIds, all)
    if (closure.length > 0) return { elements: closure, pageName: page.name, scope: "selection" }
  }
  return { elements: all, pageName: page.name, scope: "page" }
}

/** True when the selection resolves to at least one live element. */
export function hasExportableSelection(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): boolean {
  return selectedIds.length > 0 && expandIdsToCopyClosure(selectedIds, elements).length > 0
}

const FALLBACK_BASENAME = "drawing"
const UNSAFE_FILENAME_CHARS = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"])

/** `<page>.<ext>`, or `<page>-selection.<ext>`, with filesystem-hostile
 *  characters (and control characters) replaced by "-". A blank name falls
 *  back to "drawing". */
export function exportFilename(
  pageName: string,
  scope: ExportScope,
  format: "png" | "svg",
): string {
  const cleaned = Array.from(pageName, (ch) =>
    ch < " " || UNSAFE_FILENAME_CHARS.has(ch) ? "-" : ch,
  )
    .join("")
    .trim()
  const base = cleaned === "" ? FALLBACK_BASENAME : cleaned
  return `${base}${scope === "selection" ? "-selection" : ""}.${format}`
}
