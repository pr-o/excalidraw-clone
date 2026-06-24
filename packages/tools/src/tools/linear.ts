import type { Point } from "@excalidraw-clone/geometry"
import { BINDING_GAP, bindingTargetAt } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Modifiers, ToolEffect } from "../types"
import { addBackRef } from "../binding-refs"

export type LinearState =
  | { phase: "idle" }
  | {
      phase: "drawing"
      start: Point
      current: Point
      elementId: string
      startBindId: string | null
      endBindId: string | null
    }

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

const bindIdAt = (
  at: Point,
  bindTargets: readonly ExcalidrawElement[] | undefined,
): string | null => (bindTargets ? (bindingTargetAt(at, bindTargets)?.id ?? null) : null)

export interface LinearPatch {
  x: number
  y: number
  width: number
  height: number
  points: readonly Point[]
}

export const linearPatch = (start: Point, end: Point): LinearPatch => {
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
  bindTargets?: readonly ExcalidrawElement[]
}

export const linearReduce = ({
  state,
  event,
  modifiers,
  factory,
  bindTargets,
}: LinearReducerArgs): [LinearState, readonly ToolEffect[]] => {
  if (state.phase === "idle") {
    if (event.type === "pointerDown") {
      const element = factory(event.at)
      const next: LinearState = {
        phase: "drawing",
        start: event.at,
        current: event.at,
        elementId: element.id,
        startBindId: bindIdAt(event.at, bindTargets),
        endBindId: null,
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
        { ...state, current: end, endBindId: bindIdAt(end, bindTargets) },
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
      const startBindId = state.startBindId
      const endBindId = bindIdAt(end, bindTargets)
      return [
        next,
        [
          {
            kind: "mutation",
            apply: (draft) => {
              const i = draft.findIndex((e) => e.id === id)
              if (i < 0) return
              let arrow = { ...draft[i]!, ...patch } as ExcalidrawArrowElement
              if (startBindId) {
                arrow = {
                  ...arrow,
                  startBinding: { elementId: startBindId, focus: 0, gap: BINDING_GAP },
                }
                addBackRef(draft, startBindId, id)
              }
              if (endBindId) {
                arrow = {
                  ...arrow,
                  endBinding: { elementId: endBindId, focus: 0, gap: BINDING_GAP },
                }
                addBackRef(draft, endBindId, id)
              }
              draft[i] = arrow
            },
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
