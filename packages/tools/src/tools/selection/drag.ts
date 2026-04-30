import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "../../types"

export const translateElements = (
  draft: ExcalidrawElement[],
  ids: readonly string[],
  dx: number,
  dy: number,
): void => {
  if (dx === 0 && dy === 0) return
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (!ids.includes(e.id)) continue
    draft[i] = { ...e, x: e.x + dx, y: e.y + dy }
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
