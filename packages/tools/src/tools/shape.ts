import type { Bounds, Point } from "@excalidraw-clone/geometry"
import {
  newDiamond,
  newEllipse,
  newFrame,
  newHexagon,
  newOctagon,
  newParallelogram,
  newPentagon,
  newRectangle,
  newTriangle,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"
import { addDraftEffect, commitDraftEffects, discardDraftEffect, patchDraftEffect } from "../draft"
import type { Modifiers, Tool, ToolEffect, ToolEvent, ToolName } from "../types"

export type ShapeState =
  { phase: "idle" } | { phase: "drawing"; start: Point; current: Point; elementId: string }

export const SHAPE_INITIAL: ShapeState = { phase: "idle" }

/** A press-release shorter than this (px, both axes) is a click, not a drag. */
export const CLICK_SLOP = 4

/** The box dragged from `down` to `at`: Shift makes it square, Alt grows it from the centre. */
export const computeBox = (down: Point, at: Point, mods: Modifiers): Bounds => {
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
  event: ToolEvent
  modifiers: Modifiers
  /** Factory that produces a fresh element with the given box. Return value owns its own id/seed/etc. */
  factory: (box: Bounds) => ExcalidrawElement
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
      const empty = box.width === 0 || box.height === 0
      return [{ phase: "idle" }, empty ? [discardDraftEffect(id)] : commitDraftEffects(id, box)]
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
  factory: (box: Bounds) => ExcalidrawElement,
): Tool<ShapeState, ToolEvent> => ({
  name,
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx) {
    return shapeReduce({ state, event, modifiers: ctx.modifiers, factory })
  },
})

// The drag-a-box tools.
export const rectangleTool = shapeTool("rectangle", (box) => newRectangle(box))
export const ellipseTool = shapeTool("ellipse", (box) => newEllipse(box))
export const diamondTool = shapeTool("diamond", (box) => newDiamond(box))
export const triangleTool = shapeTool("triangle", (box) => newTriangle(box))
export const parallelogramTool = shapeTool("parallelogram", (box) => newParallelogram(box))
export const hexagonTool = shapeTool("hexagon", (box) => newHexagon(box))
export const pentagonTool = shapeTool("pentagon", (box) => newPentagon(box))
export const octagonTool = shapeTool("octagon", (box) => newOctagon(box))
export const frameTool = shapeTool("frame", (box) => newFrame(box))
