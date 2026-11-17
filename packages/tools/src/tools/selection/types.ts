import type { Point, ResizeHandle } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement, ExcalidrawTableElement } from "@excalidraw-clone/scene"
import type { CropOrigin } from "./crop"
import type { LinearSnapshot } from "./endpoint"
import type { ResizeOrigin } from "./resize"
import type { ToolEffect } from "../../types"

export type { ResizeHandle } from "@excalidraw-clone/geometry"

/** Which end of an arrow or line. */
export type LinearEnd = "start" | "end"

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
      /** The scene at pointerDown, restored by Escape (undoes torn-off bindings too). */
      original: readonly ExcalidrawElement[]
      /** Alt was held at press: copy `movedIds` on the first move instead. */
      dupPending?: boolean
      /** Ids of the copies once made (`movedIds` then points at them). */
      dupIds?: readonly string[]
      /** Selection to restore if Escape discards the copies. */
      dupRestore?: readonly string[]
    }
  | {
      phase: "resizing"
      handle: ResizeHandle
      elementId: string
      origin: ResizeOrigin
      start: Point
    }
  | {
      phase: "groupResizing"
      handle: ResizeHandle
      ids: readonly string[]
      origin: ResizeOrigin
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
      end: LinearEnd
      origin: LinearSnapshot
      candidateBindId: string | null
    }
  | {
      phase: "bendDragging"
      elementId: string
      index: number
      origin: LinearSnapshot
    }
  | {
      phase: "tableResizing"
      elementId: string
      axis: "col" | "row"
      index: number
      /** The table as it was when the border was grabbed. */
      original: ExcalidrawTableElement
      start: Point
    }
  | { phase: "cropping"; elementId: string }
  | {
      phase: "cropDragging"
      elementId: string
      handle: ResizeHandle
      origin: CropOrigin
      start: Point
    }
  | { phase: "marquee"; start: Point; current: Point; baseSelection: readonly string[] }

export const SELECTION_INITIAL: SelectionState = { phase: "idle" }

/** A reducer step: the next state and the effects to apply. */
export type Transition = [SelectionState, readonly ToolEffect[]]
