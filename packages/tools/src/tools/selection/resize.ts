import { rotatePoint, type Point } from "@excalidraw-clone/geometry"
import { fitTableBox, type ExcalidrawElement, type ResizeAnchor } from "@excalidraw-clone/scene"
import type { Modifiers, ToolEffect, ToolContext, ToolEvent } from "../../types"
import { buildRecommitEffect } from "./recommit"
import type { ResizeHandle, SelectionState, Transition } from "./types"
import { snapResizeToUserGuides } from "./alignment"

export interface ResizeOrigin {
  x: number
  y: number
  width: number
  height: number
  angle: number
  /** Free text only: autoResize before the gesture, restored on revert. */
  autoResize?: boolean
}

export const computeResize = (
  origin: ResizeOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
  modifiers: Modifiers,
): { x: number; y: number; width: number; height: number } => {
  // The box is resized in the element's own (unrotated) frame, so the drag is
  // measured along its axes; a turned element's handles move along turned axes.
  const angle = origin.angle
  const drag = { x: at.x - start.x, y: at.y - start.y }
  const { x: dx, y: dy } = angle === 0 ? drag : rotatePoint(drag, { x: 0, y: 0 }, -angle)
  let { x, y, width, height } = origin
  switch (handle) {
    case "nw":
      x = origin.x + dx
      y = origin.y + dy
      width = origin.width - dx
      height = origin.height - dy
      break
    case "n":
      y = origin.y + dy
      height = origin.height - dy
      break
    case "ne":
      y = origin.y + dy
      width = origin.width + dx
      height = origin.height - dy
      break
    case "e":
      width = origin.width + dx
      break
    case "se":
      width = origin.width + dx
      height = origin.height + dy
      break
    case "s":
      height = origin.height + dy
      break
    case "sw":
      x = origin.x + dx
      width = origin.width - dx
      height = origin.height + dy
      break
    case "w":
      x = origin.x + dx
      width = origin.width - dx
      break
  }
  if (modifiers.shift && origin.width > 0 && origin.height > 0) {
    const aspect = origin.width / origin.height
    if (Math.abs(width / Math.max(height, 1)) > aspect) {
      const newH = Math.abs(width) / aspect
      const sign = height < 0 ? -1 : 1
      // Anchor adjustment for handles whose y was moved by the drag.
      if (handle === "nw" || handle === "ne" || handle === "n") {
        y = origin.y + origin.height - sign * newH
      }
      height = sign * newH
    } else {
      const newW = Math.abs(height) * aspect
      const sign = width < 0 ? -1 : 1
      if (handle === "nw" || handle === "sw" || handle === "w") {
        x = origin.x + origin.width - sign * newW
      }
      width = sign * newW
    }
  }
  // Normalize negative width/height by flipping anchor.
  if (width < 0) {
    x = x + width
    width = -width
  }
  if (height < 0) {
    y = y + height
    height = -height
  }
  if (angle !== 0) {
    // The element turns about its centre, which just moved; shift the box so the
    // corner opposite the dragged handle stays where it is on screen.
    const shift = {
      x: x + width / 2 - (origin.x + origin.width / 2),
      y: y + height / 2 - (origin.y + origin.height / 2),
    }
    const turned = rotatePoint(shift, { x: 0, y: 0 }, angle)
    x += turned.x - shift.x
    y += turned.y - shift.y
  }
  return { x, y, width, height }
}

/** Which side of the resized `box` stays put on each axis: the edge opposite
 *  the dragged handle — which, once the drag crosses over it (negative size,
 *  normalised by computeResize), is the box's start edge again. */
export const anchorSides = (
  origin: ResizeOrigin,
  handle: ResizeHandle,
  box: { x: number; y: number; width: number; height: number },
): ResizeAnchor => {
  const side = (
    moves: boolean,
    o0: number,
    size: number,
    b0: number,
    bSize: number,
  ): ResizeAnchor["x"] => {
    const fixed = moves ? o0 + size : o0
    const dEnd = Math.abs(b0 + bSize - fixed)
    const dStart = Math.abs(b0 - fixed)
    return dEnd < dStart || (dEnd === dStart && moves) ? "end" : "start"
  }
  return {
    x: side(handle.includes("w"), origin.x, origin.width, box.x, box.width),
    y: side(handle.includes("n"), origin.y, origin.height, box.y, box.height),
  }
}

export const buildResizeMoveEffect = (
  elementId: string,
  origin: ResizeOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
  modifiers: Modifiers,
): ToolEffect => {
  const box = computeResize(origin, handle, start, at, modifiers)
  return {
    kind: "mutation",
    apply: (draft) => {
      const i = draft.findIndex((e) => e.id === elementId)
      if (i < 0) return
      const e = draft[i]!
      // A side handle on free text turns it into a fixed-width wrapping box.
      const fixWidth =
        (handle === "e" || handle === "w") && e.type === "text" && e.containerId === null
      draft[i] = fixWidth
        ? { ...e, ...box, autoResize: false }
        : e.type === "table"
          ? fitTableBox(e, box, anchorSides(origin, handle, box))
          : { ...e, ...box }
    },
    skipHistory: true,
  }
}

export const buildResizeCommitEffect = (elementId: string): ToolEffect =>
  buildRecommitEffect([elementId])

export const buildResizeRevertEffect = (elementId: string, origin: ResizeOrigin): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const e = draft[i]!
    const box = { x: origin.x, y: origin.y, width: origin.width, height: origin.height }
    draft[i] =
      e.type === "text" && origin.autoResize !== undefined
        ? { ...e, ...box, autoResize: origin.autoResize }
        : { ...e, ...box }
  },
  skipHistory: true,
})

export const snapshotElementBox = (element: ExcalidrawElement): ResizeOrigin => ({
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
  angle: element.angle,
  ...(element.type === "text" ? { autoResize: element.autoResize } : {}),
})

export const reduceResizing = (
  state: Extract<SelectionState, { phase: "resizing" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  switch (event.type) {
    case "pointerMove": {
      const snap = snapResizeToUserGuides(state.origin, state.handle, state.start, event.at, ctx)
      return [
        state,
        [
          buildResizeMoveEffect(
            state.elementId,
            state.origin,
            state.handle,
            state.start,
            snap.at,
            ctx.modifiers,
          ),
          { kind: "setGuides", guides: snap.guides },
        ],
      ]
    }
    case "pointerUp":
      return [
        { phase: "idle" },
        [buildResizeCommitEffect(state.elementId), { kind: "setGuides", guides: [] }],
      ]
    case "escape":
      return [
        { phase: "idle" },
        [buildResizeRevertEffect(state.elementId, state.origin), { kind: "setGuides", guides: [] }],
      ]
    default:
      return [state, []]
  }
}
