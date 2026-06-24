import type { Point } from "@excalidraw-clone/geometry"
import type { LinearSnapshot } from "./endpoint"

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export type SelectionState =
  | { phase: "idle" }
  | {
      phase: "dragging"
      start: Point
      last: Point
      movedIds: readonly string[]
      firstMove: boolean
    }
  | {
      phase: "resizing"
      handle: ResizeHandle
      elementId: string
      origin: { x: number; y: number; width: number; height: number; angle: number }
      start: Point
    }
  | {
      phase: "rotating"
      elementId: string
      origin: { angle: number }
      center: Point
      pointerAngleAtStart: number
    }
  | {
      phase: "endpointDragging"
      elementId: string
      end: "start" | "end"
      origin: LinearSnapshot
      candidateBindId: string | null
    }
  | { phase: "marquee"; start: Point; current: Point; baseSelection: readonly string[] }

export const SELECTION_INITIAL: SelectionState = { phase: "idle" }
