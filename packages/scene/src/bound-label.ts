import type { ExcalidrawElement, ExcalidrawTextElement } from "./types"

/** A text element that is the label of a container shape (not a free-standing text). */
export type BoundLabel = ExcalidrawTextElement & { containerId: string }

/**
 * True for container labels. Labels are never selected, hit-tested, bound to or
 * copied on their own: they follow their container.
 */
export const isBoundLabel = (el: ExcalidrawElement): el is BoundLabel =>
  el.type === "text" && el.containerId !== null

/** A label pulled into an edit only because its container is in it too. Group
 *  transforms (flip, resize) skip it: transforming it directly would, e.g., mirror
 *  its text, and `reconcileBoundText` (run by every `Scene.mutate`) re-lays it out
 *  against the transformed container anyway. Selected on its own (container not
 *  in the set), a label is transformed like any element. */
export const isPassengerLabel = (el: ExcalidrawElement, inSet: ReadonlySet<string>): boolean =>
  isBoundLabel(el) && inSet.has(el.containerId)
