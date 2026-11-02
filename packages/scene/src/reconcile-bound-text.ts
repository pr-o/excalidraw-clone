import {
  labelInnerBox,
  polylineMidpoint,
  rotatePoint,
  type LabelShapeKind,
} from "@excalidraw-clone/geometry"
import { mirrorOf } from "./flip"
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
  "pentagon",
  "octagon",
])

/** Shapes that honour `gradient`: the labelable closed shapes plus tables
 *  (whose background fill takes it; the header tint stays flat). */
export const GRADIENT_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  ...LABELABLE_TYPES,
  "table",
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
    // mirror-aware: a flipped triangle/pentagon's inscribed box moves with the
    // outline, so the label stays inside the shape the user actually sees.
    return labelInnerBox(
      container.type as LabelShapeKind,
      container,
      NOTE_PADDING,
      mirrorOf(container),
    )
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
 * shape-aware inner label box (turned with the container's angle) and vertically centered (its textAlign is
 * left to the user); a linear
 * (arrow/line) container keeps its bound text recentered on the path
 * midpoint without resizing. A deleted container cascades isDeleted to its
 * text. Text content is never modified. Idempotent and O(n). Safe to run
 * after every mutation.
 */
export function reconcileBoundText(draft: ExcalidrawElement[]): void {
  // id → first index, built on first use (the loop only replaces slots, never moves them).
  let indexOf: Map<string, number> | null = null
  for (let i = 0; i < draft.length; i += 1) {
    const container = draft[i]!
    if (!container.boundElements) continue
    const ref = container.boundElements.find((b) => b.type === "text")
    if (!ref) continue
    if (!indexOf) {
      indexOf = new Map()
      for (let j = 0; j < draft.length; j += 1)
        if (!indexOf.has(draft[j]!.id)) indexOf.set(draft[j]!.id, j)
    }
    const ti = indexOf.get(ref.id) ?? -1
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

    const box = innerBoxFor(container)
    const { width, height } = box
    let { x, y } = box
    // A shape label rotates with its shape (as upstream Excalidraw's bound
    // text does): its box centre turns about the container's centre and it
    // takes the container's angle, so every renderer rotates it in place.
    const angle = container.angle
    if (angle !== 0) {
      const c = rotatePoint(
        { x: x + width / 2, y: y + height / 2 },
        { x: container.x + container.width / 2, y: container.y + container.height / 2 },
        angle,
      )
      x = c.x - width / 2
      y = c.y - height / 2
    }
    if (
      text.x !== x ||
      text.y !== y ||
      text.width !== width ||
      text.height !== height ||
      text.angle !== angle ||
      text.verticalAlign !== "middle"
    ) {
      // textAlign is the user's choice for shape labels; only the box and vertical centering are owned here.
      draft[ti] = { ...text, x, y, width, height, angle, verticalAlign: "middle" }
    }
  }
}
