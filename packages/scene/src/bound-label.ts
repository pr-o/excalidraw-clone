import type { ExcalidrawElement, ExcalidrawTextElement } from "./types"

/** A text element that is the label of a container shape (not a free-standing text). */
export type BoundLabel = ExcalidrawTextElement & { containerId: string }

/**
 * True for container labels. Labels are never selected, hit-tested, bound to or
 * copied on their own: they follow their container.
 */
export const isBoundLabel = (el: ExcalidrawElement): el is BoundLabel =>
  el.type === "text" && el.containerId !== null
