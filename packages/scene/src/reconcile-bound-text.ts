import { labelInnerBox, polylineMidpoint, type LabelShapeKind } from "@excalidraw-clone/geometry"
import type { ElementType, ExcalidrawElement } from "./types"

/** Padding (px) between a note container's box and its bound text box. */
export const NOTE_PADDING = 8

/** Container shapes that can carry a bound text label. */
export const LABELABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "parallelogram",
  "hexagon",
])

/** Linear elements that can carry a midpoint-pinned bound text label. */
export const LINEAR_LABELABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "arrow",
  "line",
])

const innerBoxFor = (
  container: ExcalidrawElement,
): { x: number; y: number; width: number; height: number } => {
  if (LABELABLE_TYPES.has(container.type)) {
    return labelInnerBox(container.type as LabelShapeKind, container, NOTE_PADDING)
  }
  return {
    x: container.x + NOTE_PADDING,
    y: container.y + NOTE_PADDING,
    width: Math.max(0, container.width - 2 * NOTE_PADDING),
    height: Math.max(0, container.height - 2 * NOTE_PADDING),
  }
}

/**
 * Enforce the container↔bound-text invariant in place on a mutation draft:
 * each non-deleted shape container keeps its bound text sized to the
 * shape-aware inner label box and center/middle aligned; a linear
 * (arrow/line) container keeps its bound text recentered on the path
 * midpoint without resizing. A deleted container cascades isDeleted to its
 * text. Text content is never modified. Idempotent and O(n). Safe to run
 * after every mutation.
 */
export function reconcileBoundText(draft: ExcalidrawElement[]): void {
  for (let i = 0; i < draft.length; i += 1) {
    const container = draft[i]!
    if (!container.boundElements) continue
    const ref = container.boundElements.find((b) => b.type === "text")
    if (!ref) continue
    const ti = draft.findIndex((e) => e.id === ref.id)
    if (ti < 0) continue
    const text = draft[ti]!
    if (text.type !== "text") continue

    if (container.isDeleted) {
      if (!text.isDeleted) draft[ti] = { ...text, isDeleted: true }
      continue
    }

    if (container.type === "arrow" || container.type === "line") {
      const mid = polylineMidpoint(container.points)
      const x = container.x + mid.x - text.width / 2
      const y = container.y + mid.y - text.height / 2
      if (
        text.x !== x ||
        text.y !== y ||
        text.textAlign !== "center" ||
        text.verticalAlign !== "middle"
      ) {
        draft[ti] = { ...text, x, y, textAlign: "center", verticalAlign: "middle" }
      }
      continue
    }

    const { x, y, width, height } = innerBoxFor(container)
    if (
      text.x !== x ||
      text.y !== y ||
      text.width !== width ||
      text.height !== height ||
      text.textAlign !== "center" ||
      text.verticalAlign !== "middle"
    ) {
      draft[ti] = { ...text, x, y, width, height, textAlign: "center", verticalAlign: "middle" }
    }
  }
}
