import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** One searchable label on the canvas: a text element's text, or a frame's name. */
export interface SearchableItem {
  id: string
  label: string
}

/** Extract the searchable labels from a scene: every live `text` element's text
 *  (bound labels included — a container id is irrelevant here) and every live
 *  `frame`'s name. Blank labels and deleted elements are skipped. Input order is
 *  preserved so callers can cycle through matches in z-order. */
export function collectSearchableItems(elements: readonly ExcalidrawElement[]): SearchableItem[] {
  const items: SearchableItem[] = []
  for (const el of elements) {
    if (el.isDeleted) continue
    const label = el.type === "text" ? el.text : el.type === "frame" ? el.name : null
    if (label === null || label.trim() === "") continue
    items.push({ id: el.id, label })
  }
  return items
}

/** Case-insensitive substring filter. A blank query matches nothing — find-on-canvas
 *  highlights and cycles matches, so "no query" must mean "no matches", not
 *  "every label" (which is what a command palette would show). */
export function filterMatches(items: readonly SearchableItem[], query: string): SearchableItem[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") return []
  return items.filter((item) => item.label.toLowerCase().includes(needle))
}

/** Whether a matched element may be selected — locked elements stay unselectable. */
export function isSelectableMatch(el: ExcalidrawElement): boolean {
  return !el.locked
}
