import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "../../types"
import { removeBackRef } from "../../binding-refs"

const unbindMovedArrow = (
  draft: ExcalidrawElement[],
  arrow: ExcalidrawArrowElement,
  movedIds: ReadonlySet<string>,
): ExcalidrawArrowElement => {
  let startBinding = arrow.startBinding
  let endBinding = arrow.endBinding
  if (startBinding && !movedIds.has(startBinding.elementId)) {
    removeBackRef(draft, startBinding.elementId, arrow.id)
    startBinding = null
  }
  if (endBinding && !movedIds.has(endBinding.elementId)) {
    removeBackRef(draft, endBinding.elementId, arrow.id)
    endBinding = null
  }
  if (startBinding === arrow.startBinding && endBinding === arrow.endBinding) return arrow
  return { ...arrow, startBinding, endBinding }
}

export const translateElements = (
  draft: ExcalidrawElement[],
  ids: readonly string[],
  dx: number,
  dy: number,
): void => {
  if (dx === 0 && dy === 0) return
  const movedIds = new Set(ids)
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (!movedIds.has(e.id)) continue
    let next: ExcalidrawElement = { ...e, x: e.x + dx, y: e.y + dy }
    if (next.type === "arrow") {
      next = unbindMovedArrow(draft, next, movedIds)
    }
    draft[i] = next
  }
}

export const buildDragMoveEffect = (
  ids: readonly string[],
  dx: number,
  dy: number,
): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => translateElements(draft, ids, dx, dy),
  skipHistory: true,
})

export const buildDragCommitEffect = (ids: readonly string[]): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    // No-op replace: re-emit each moved element to push a fresh history snapshot.
    for (let i = 0; i < draft.length; i += 1) {
      const e = draft[i]!
      if (!ids.includes(e.id)) continue
      draft[i] = { ...e }
    }
  },
})

/** Undoes a drag by translating by the negation of the total translation
 *  applied over the drag (raw pointer travel plus any baked-in alignment
 *  correction). */
export const buildDragRevertEffect = (
  ids: readonly string[],
  appliedDx: number,
  appliedDy: number,
): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => translateElements(draft, ids, -appliedDx, -appliedDy),
  skipHistory: true,
})
