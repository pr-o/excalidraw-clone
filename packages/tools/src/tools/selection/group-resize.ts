import type { Point } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, resizeElements } from "@excalidraw-clone/scene"
import type { Modifiers, ToolEffect } from "../../types"
import { computeResize, type ResizeOrigin } from "./resize"
import type { ResizeHandle } from "./types"

/** Overwrite each draft element that appears in `next` with its
 *  replacement, matched by id. Elements not present in `next` (locked,
 *  deleted, or passenger labels — see `resizeElements`) are left
 *  untouched. */
const applyReplacements = (
  draft: ExcalidrawElement[],
  next: readonly ExcalidrawElement[],
): void => {
  const byId = new Map(next.map((e) => [e.id, e]))
  for (let i = 0; i < draft.length; i += 1) {
    const replacement = byId.get(draft[i]!.id)
    if (replacement) draft[i] = replacement
  }
}

/** Absolute, path-independent per-frame move effect: always scales from the
 *  pristine `originalElements` snapshot captured at pointerDown, relative
 *  to the frozen `origin` box — never from the live (possibly
 *  already-mutated) draft. This mirrors how the existing single-element
 *  `buildResizeMoveEffect` always recomputes the whole box from `origin` +
 *  total pointer displacement rather than accumulating incremental deltas,
 *  so repeated pointerMove events (and an eventual escape/revert) stay
 *  exact regardless of path or of the text fontSize floor clamp in
 *  `resizeElements`. */
export const buildGroupResizeMoveEffect = (
  ids: readonly string[],
  originalElements: readonly ExcalidrawElement[],
  origin: ResizeOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
  modifiers: Modifiers,
): ToolEffect => {
  const box = computeResize(origin, handle, start, at, modifiers)
  return {
    kind: "mutation",
    apply: (draft) => applyReplacements(draft, resizeElements(originalElements, ids, origin, box)),
    skipHistory: true,
  }
}

export const buildGroupResizeCommitEffect = (ids: readonly string[]): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    // No-op replace: re-emit each resized element to push a fresh history snapshot.
    for (let i = 0; i < draft.length; i += 1) {
      const e = draft[i]!
      if (!ids.includes(e.id)) continue
      draft[i] = { ...e }
    }
  },
})

export const buildGroupResizeRevertEffect = (
  ids: readonly string[],
  originalElements: readonly ExcalidrawElement[],
): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => applyReplacements(draft, originalElements),
  skipHistory: true,
})
