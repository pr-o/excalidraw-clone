import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Modifiers, ToolEffect } from "../types"

export type LinearState =
  | { phase: "idle" }
  | { phase: "drawing"; start: Point; current: Point; elementId: string }

export const LINEAR_INITIAL: LinearState = { phase: "idle" }

const SNAP_STEP = Math.PI / 4

export const constrainAngle = (start: Point, at: Point): Point => {
  const dx = at.x - start.x
  const dy = at.y - start.y
  if (dx === 0 && dy === 0) return at
  const len = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / SNAP_STEP) * SNAP_STEP
  return {
    x: start.x + Math.cos(snapped) * len,
    y: start.y + Math.sin(snapped) * len,
  }
}

const replaceElement = (draft: ExcalidrawElement[], id: string, patch: LinearPatch): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  const prev = draft[i]!
  draft[i] = { ...prev, ...patch }
}

const removeElement = (draft: ExcalidrawElement[], id: string): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i >= 0) draft.splice(i, 1)
}

interface LinearPatch {
  x: number
  y: number
  width: number
  height: number
  points: readonly Point[]
}

const linearPatch = (start: Point, end: Point): LinearPatch => {
  const minX = Math.min(start.x, end.x)
  const minY = Math.min(start.y, end.y)
  return {
    x: minX,
    y: minY,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    points: [
      { x: start.x - minX, y: start.y - minY },
      { x: end.x - minX, y: end.y - minY },
    ],
  }
}

interface LinearReducerArgs {
  state: LinearState
  event:
    | { type: "pointerDown"; at: Point }
    | { type: "pointerMove"; at: Point }
    | { type: "pointerUp"; at: Point }
    | { type: "escape" }
    | { type: "doubleClick"; at: Point }
    | { type: "delete" }
  modifiers: Modifiers
  factory: (start: Point) => ExcalidrawElement
}

export const linearReduce = ({
  state,
  event,
  modifiers,
  factory,
}: LinearReducerArgs): [LinearState, readonly ToolEffect[]] => {
  if (state.phase === "idle") {
    if (event.type === "pointerDown") {
      const element = factory(event.at)
      const next: LinearState = {
        phase: "drawing",
        start: event.at,
        current: event.at,
        elementId: element.id,
      }
      return [
        next,
        [
          {
            kind: "mutation",
            apply: (draft) => {
              draft.push(element)
            },
            skipHistory: true,
          },
        ],
      ]
    }
    return [state, []]
  }
  switch (event.type) {
    case "pointerMove": {
      const end = modifiers.shift ? constrainAngle(state.start, event.at) : event.at
      const id = state.elementId
      const patch = linearPatch(state.start, end)
      return [
        { ...state, current: end },
        [
          {
            kind: "mutation",
            apply: (draft) => replaceElement(draft, id, patch),
            skipHistory: true,
          },
        ],
      ]
    }
    case "pointerUp": {
      const end = modifiers.shift ? constrainAngle(state.start, event.at) : event.at
      const id = state.elementId
      const patch = linearPatch(state.start, end)
      const next: LinearState = { phase: "idle" }
      const zero = end.x === state.start.x && end.y === state.start.y
      if (zero) {
        return [
          next,
          [
            {
              kind: "mutation",
              apply: (draft) => removeElement(draft, id),
              skipHistory: true,
            },
          ],
        ]
      }
      return [
        next,
        [
          {
            kind: "mutation",
            apply: (draft) => replaceElement(draft, id, patch),
          },
          { kind: "select", ids: [id] },
          { kind: "switchTool", tool: "selection" },
        ],
      ]
    }
    case "escape": {
      const id = state.elementId
      return [
        { phase: "idle" },
        [
          {
            kind: "mutation",
            apply: (draft) => removeElement(draft, id),
            skipHistory: true,
          },
        ],
      ]
    }
    default:
      return [state, []]
  }
}
