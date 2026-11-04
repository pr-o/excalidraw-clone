import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import {
  addDraftEffect,
  discardDraftEffect,
  patchDraftEffect,
  patchElement,
  selectAndSwitchEffects,
} from "../draft"
import type { Modifiers, Tool, ToolContext, ToolEffect, ToolEvent, ToolName } from "../types"

export interface ShapeBox {
  x: number
  y: number
  width: number
  height: number
}

export type ShapeState =
  { phase: "idle" } | { phase: "drawing"; start: Point; current: Point; elementId: string }

export const SHAPE_INITIAL: ShapeState = { phase: "idle" }

export const computeBox = (down: Point, at: Point, mods: Modifiers): ShapeBox => {
  let dx = at.x - down.x
  let dy = at.y - down.y
  if (mods.shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy))
    dx = dx < 0 ? -m : m
    dy = dy < 0 ? -m : m
  }
  if (mods.alt) {
    const w = Math.abs(dx) * 2
    const h = Math.abs(dy) * 2
    return { x: down.x - Math.abs(dx), y: down.y - Math.abs(dy), width: w, height: h }
  }
  const x = dx >= 0 ? down.x : down.x + dx
  const y = dy >= 0 ? down.y : down.y + dy
  return { x, y, width: Math.abs(dx), height: Math.abs(dy) }
}

interface ShapeReducerArgs {
  state: ShapeState
  event:
    | { type: "pointerDown"; at: Point }
    | { type: "pointerMove"; at: Point }
    | { type: "pointerUp"; at: Point }
    | { type: "escape" }
    | { type: "doubleClick"; at: Point }
    | { type: "delete" }
  modifiers: Modifiers
  /** Factory that produces a fresh element with the given box. Return value owns its own id/seed/etc. */
  factory: (box: ShapeBox) => ExcalidrawElement
}

export const shapeReduce = ({
  state,
  event,
  modifiers,
  factory,
}: ShapeReducerArgs): [ShapeState, readonly ToolEffect[]] => {
  if (state.phase === "idle") {
    if (event.type === "pointerDown") {
      const element = factory({ x: event.at.x, y: event.at.y, width: 0, height: 0 })
      const next: ShapeState = {
        phase: "drawing",
        start: event.at,
        current: event.at,
        elementId: element.id,
      }
      return [next, [addDraftEffect(element)]]
    }
    return [state, []]
  }
  // phase === "drawing"
  switch (event.type) {
    case "pointerMove": {
      const box = computeBox(state.start, event.at, modifiers)
      const id = state.elementId
      return [{ ...state, current: event.at }, [patchDraftEffect(id, box)]]
    }
    case "pointerUp": {
      const box = computeBox(state.start, event.at, modifiers)
      const id = state.elementId
      const next: ShapeState = { phase: "idle" }
      if (box.width === 0 || box.height === 0) {
        return [next, [discardDraftEffect(id)]]
      }
      return [
        next,
        [
          {
            kind: "mutation",
            apply: (draft) => patchElement(draft, id, box),
          },
          ...selectAndSwitchEffects(id),
        ],
      ]
    }
    case "escape": {
      const id = state.elementId
      return [{ phase: "idle" }, [discardDraftEffect(id)]]
    }
    default:
      return [state, []]
  }
}

/** A drag-to-draw box tool: `factory` builds the element for each new box. */
export const shapeTool = (
  name: ToolName,
  factory: (box: ShapeBox) => ExcalidrawElement,
): Tool<ShapeState, ToolEvent> => ({
  name,
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    return shapeReduce({ state, event, modifiers: ctx.modifiers, factory })
  },
})
