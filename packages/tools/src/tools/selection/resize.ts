import type { Point } from "@excalidraw-clone/geometry"
import { fitTableBox, type ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Modifiers, ToolEffect } from "../../types"
import type { ResizeHandle } from "./types"

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
  const dx = at.x - start.x
  const dy = at.y - start.y
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
  return { x, y, width, height }
}

type Side = "start" | "end"

/** Which side of the resized `box` stays put on each axis: the edge opposite
 *  the dragged handle — which, once the drag crosses over it (negative size,
 *  normalised by computeResize), is the box's start edge again. */
export const anchorSides = (
  origin: ResizeOrigin,
  handle: ResizeHandle,
  box: { x: number; y: number; width: number; height: number },
): { x: Side; y: Side } => {
  const side = (moves: boolean, o0: number, size: number, b0: number, bSize: number): Side => {
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

export const buildResizeCommitEffect = (elementId: string): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    draft[i] = { ...draft[i]! }
  },
})

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
