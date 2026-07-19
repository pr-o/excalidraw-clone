import {
  cloneElementsWithNewIds,
  expandIdsToCopyClosure,
  getElementBounds,
  newText,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"

export const CLIPBOARD_TYPE = "excalidraw-clone/clipboard"

interface ClipboardEnvelope {
  type: typeof CLIPBOARD_TYPE
  version: 1
  elements: ExcalidrawElement[]
}

/** Serialize the copy closure of a selection into the clipboard envelope.
 *  Returns the JSON text plus the closure's ids (cut deletes those), or
 *  null when there is nothing to copy. */
export function copyPayload(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): { text: string; ids: readonly string[] } | null {
  const closure = expandIdsToCopyClosure(selectedIds, elements)
  if (closure.length === 0) return null
  const envelope: ClipboardEnvelope = { type: CLIPBOARD_TYPE, version: 1, elements: closure }
  return { text: JSON.stringify(envelope), ids: closure.map((el) => el.id) }
}

const parseEnvelope = (text: string): ClipboardEnvelope | null => {
  try {
    const parsed = JSON.parse(text) as unknown
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === CLIPBOARD_TYPE &&
      Array.isArray((parsed as { elements?: unknown }).elements)
    ) {
      return parsed as ClipboardEnvelope
    }
  } catch {
    // not JSON — fall through to plain text
  }
  return null
}

/** Turn clipboard text into elements to append: envelope → fresh-id clones
 *  whose bounding-box center lands at `at`; other non-blank text → one text
 *  element at `at`; blank/empty → nothing. */
export function buildPaste(text: string, at: { x: number; y: number }): ExcalidrawElement[] {
  if (text.trim() === "") return []
  const envelope = parseEnvelope(text)
  if (envelope === null) {
    return [newText({ x: at.x, y: at.y, text })]
  }
  if (envelope.elements.length === 0) return []
  const clones = cloneElementsWithNewIds(envelope.elements)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of clones) {
    const b = getElementBounds(el)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  const dx = at.x - (minX + maxX) / 2
  const dy = at.y - (minY + maxY) / 2
  return clones.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy }))
}
