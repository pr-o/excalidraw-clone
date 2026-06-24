import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "../../types"

const removeBackRef = (draft: ExcalidrawElement[], targetId: string, arrowId: string): void => {
  const j = draft.findIndex((e) => e.id === targetId)
  if (j < 0) return
  const t = draft[j]!
  if (!t.boundElements) return
  draft[j] = { ...t, boundElements: t.boundElements.filter((b) => b.id !== arrowId) }
}

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

export const buildDragRevertEffect = (
  ids: readonly string[],
  start: Point,
  last: Point,
): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => translateElements(draft, ids, start.x - last.x, start.y - last.y),
  skipHistory: true,
})
