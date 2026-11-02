import type { Point } from "@excalidraw-clone/geometry"
import {
  addBackRef,
  BINDING_GAP,
  bindingTargetAt,
  type LinearPatch,
  pointsPatch,
} from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import {
  addDraftEffect,
  discardDraftEffect,
  patchDraftEffect,
  selectAndSwitchEffects,
} from "../draft"
import type { Modifiers, ToolEffect } from "../types"

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

const bindIdAt = (
  at: Point,
  bindTargets: readonly ExcalidrawElement[] | undefined,
): string | null => (bindTargets ? (bindingTargetAt(at, bindTargets)?.id ?? null) : null)

export const linearPatch = (start: Point, end: Point): LinearPatch => pointsPatch([start, end])

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
      return [next, [addDraftEffect(element)]]
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
        [patchDraftEffect(id, patch)],
      ]
    }
    case "pointerUp": {
      const end = modifiers.shift ? constrainAngle(state.start, event.at) : event.at
      const id = state.elementId
      const patch = linearPatch(state.start, end)
      const next: LinearState = { phase: "idle" }
      const zero = end.x === state.start.x && end.y === state.start.y
      if (zero) {
        return [next, [discardDraftEffect(id)]]
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
