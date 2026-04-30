import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Modifiers, ToolEffect } from "../../types"
import type { ResizeHandle } from "./types"

export interface ResizeOrigin {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

const computeResize = (
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
      draft[i] = { ...draft[i]!, ...box }
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
    draft[i] = { ...e, x: origin.x, y: origin.y, width: origin.width, height: origin.height }
  },
  skipHistory: true,
})

export const snapshotElementBox = (element: ExcalidrawElement): ResizeOrigin => ({
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
  angle: element.angle,
})
