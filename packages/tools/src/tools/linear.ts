import type { Point } from "@excalidraw-clone/geometry"
import {
  addBackRef,
  BINDING_GAP,
  bindingTargetAt,
  patchElement,
  pointsPatch,
  type ExcalidrawElement,
  type PointBinding,
} from "@excalidraw-clone/scene"
import {
  addDraftEffect,
  discardDraftEffect,
  patchDraftEffect,
  selectAndSwitchEffects,
} from "../draft"
import type { Modifiers, ToolEffect, ToolEvent } from "../types"

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

/** `at`, turned about `start` to the nearest 45° direction (same distance). */
const constrainAngle = (start: Point, at: Point): Point => {
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

/** The line's end for a pointer at `at`: Shift snaps it to 45° steps. */
const endPoint = (start: Point, at: Point, modifiers: Modifiers): Point =>
  modifiers.shift ? constrainAngle(start, at) : at

const binding = (elementId: string): PointBinding => ({ elementId, focus: 0, gap: BINDING_GAP })

interface LinearReducerArgs {
  state: LinearState
  event: ToolEvent
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
  const id = state.elementId
  switch (event.type) {
    case "pointerMove": {
      const end = endPoint(state.start, event.at, modifiers)
      return [
        { ...state, current: end, endBindId: bindIdAt(end, bindTargets) },
        [patchDraftEffect(id, pointsPatch([state.start, end]))],
      ]
    }
    case "pointerUp": {
      const end = endPoint(state.start, event.at, modifiers)
      if (end.x === state.start.x && end.y === state.start.y) {
        return [{ phase: "idle" }, [discardDraftEffect(id)]]
      }
      const { startBindId } = state
      const endBindId = bindIdAt(end, bindTargets)
      const patch = {
        ...pointsPatch([state.start, end]),
        ...(startBindId ? { startBinding: binding(startBindId) } : {}),
        ...(endBindId ? { endBinding: binding(endBindId) } : {}),
      }
      return [
        { phase: "idle" },
        [
          {
            kind: "mutation",
            apply: (draft) => {
              patchElement(draft, id, patch)
              if (startBindId) addBackRef(draft, startBindId, id)
              if (endBindId) addBackRef(draft, endBindId, id)
            },
          },
          ...selectAndSwitchEffects(id),
        ],
      ]
    }
    case "escape":
      return [{ phase: "idle" }, [discardDraftEffect(id)]]
    default:
      return [state, []]
  }
}
