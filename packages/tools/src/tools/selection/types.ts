import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
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
      /** Cumulative alignment-guide correction currently baked into the
       *  moved elements' live position (on top of raw pointer travel). */
      alignDx: number
      alignDy: number
      /** One-time grid-snap offset baked into the live position on the
       *  drag's first move (if grid was enabled then); never reset for the
       *  rest of the drag. Needed so escape's revert can undo it — it isn't
       *  part of raw pointer travel or `alignDx`/`alignDy`. */
      gridSnapDx: number
      gridSnapDy: number
    }
  | {
      phase: "resizing"
      handle: ResizeHandle
      elementId: string
      origin: { x: number; y: number; width: number; height: number; angle: number }
      start: Point
    }
  | {
      phase: "groupResizing"
      handle: ResizeHandle
      ids: readonly string[]
      origin: { x: number; y: number; width: number; height: number; angle: number }
      originalElements: readonly ExcalidrawElement[]
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
  | {
      phase: "bendDragging"
      elementId: string
      index: number
      origin: LinearSnapshot
    }
  | { phase: "marquee"; start: Point; current: Point; baseSelection: readonly string[] }

export const SELECTION_INITIAL: SelectionState = { phase: "idle" }
