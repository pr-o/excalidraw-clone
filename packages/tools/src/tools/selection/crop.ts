import {
  boundsCenter,
  pointAdd,
  rotatePoint,
  type Bounds,
  type Point,
} from "@excalidraw-clone/geometry"
import { mirrorOf, type ExcalidrawImageElement } from "@excalidraw-clone/scene"
import { updateElement } from "../../draft"
import type { ToolEffect, ToolContext, ToolEvent } from "../../types"
import type { ResizeHandle, SelectionState, Transition } from "./types"
import { findHandleAt } from "./handles"
import { reduceIdle } from "./idle"
import { buildRecommitEffect } from "./recommit"

export type Crop = NonNullable<ExcalidrawImageElement["crop"]>
const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 }
/** The smallest visible box (screen-local px) a crop drag can leave. */
const MIN_CROP_SIZE = 10
const ORIGIN: Point = { x: 0, y: 0 }

export interface CropOrigin {
  x: number
  y: number
  width: number
  height: number
  angle: number
  crop: Crop | null
  mirror: readonly [number, number]
}

export const snapshotCrop = (e: ExcalidrawImageElement): CropOrigin => ({
  x: e.x,
  y: e.y,
  width: e.width,
  height: e.height,
  angle: e.angle,
  crop: e.crop,
  mirror: mirrorOf(e),
})

/**
 * One axis of a crop drag, in screen-local px along the box. `moveLo` drags the
 * low (left/top) edge, `moveHi` the high edge. `mirrored` swaps which side of
 * the source image each screen edge trims. Returns the new [lo, hi] span of the
 * box (relative to its old low edge) and the matching crop fractions.
 */
const cropAxis = (
  size: number,
  c0: number,
  cs: number,
  mirrored: boolean,
  moveLo: boolean,
  moveHi: boolean,
  delta: number,
): { lo: number; hi: number; start: number; span: number } => {
  const k = size / cs
  const loRoom = (mirrored ? 1 - c0 - cs : c0) * k
  const hiRoom = (mirrored ? c0 : 1 - c0 - cs) * k
  const min = Math.min(MIN_CROP_SIZE, size)
  let lo = 0
  let hi = size
  if (moveLo) lo = Math.min(Math.max(delta, -loRoom), size - min)
  if (moveHi) hi = Math.max(Math.min(size + delta, size + hiRoom), min)
  return {
    lo,
    hi,
    start: c0 + (mirrored ? size - hi : lo) / k,
    span: (hi - lo) / k,
  }
}

/** Shift on a corner: one scale factor for both axes, clamped so neither axis
 *  runs out of image or under the minimum. Returns the lock-adjusted deltas. */
const lockedDeltas = (
  origin: CropOrigin,
  handle: ResizeHandle,
  c0: Crop,
  dx: number,
  dy: number,
): [number, number] => {
  const { width: w, height: h } = origin
  const loX = handle.includes("w")
  const loY = handle.includes("n")
  const room = (size: number, c: number, cs: number, mirrored: boolean, lo: boolean) =>
    ((mirrored === lo ? 1 - c - cs : c) * size) / cs
  const fx = (w + (loX ? -dx : dx)) / w
  const fy = (h + (loY ? -dy : dy)) / h
  const raw = Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy
  const max = Math.min(
    (w + room(w, c0.x, c0.width, origin.mirror[0] < 0, loX)) / w,
    (h + room(h, c0.y, c0.height, origin.mirror[1] < 0, loY)) / h,
  )
  const min = Math.max(Math.min(MIN_CROP_SIZE, w) / w, Math.min(MIN_CROP_SIZE, h) / h)
  const f = Math.max(Math.min(raw, max), min)
  return [(loX ? -1 : 1) * (f - 1) * w, (loY ? -1 : 1) * (f - 1) * h]
}

export const computeCrop = (
  origin: CropOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
  lockAspect = false,
): Bounds & { crop: Crop } => {
  const c0 = origin.crop ?? FULL_CROP
  // Pointer travel in the image's local (unrotated) axes.
  const travel = { x: at.x - start.x, y: at.y - start.y }
  let { x: dx, y: dy } = rotatePoint(travel, ORIGIN, -origin.angle)
  // Edge handles move one axis only, so a locked ratio is ambiguous: ignore Shift.
  if (lockAspect && handle.length === 2) [dx, dy] = lockedDeltas(origin, handle, c0, dx, dy)
  const xa = cropAxis(
    origin.width,
    c0.x,
    c0.width,
    origin.mirror[0] < 0,
    handle.includes("w"),
    handle.includes("e"),
    dx,
  )
  const ya = cropAxis(
    origin.height,
    c0.y,
    c0.height,
    origin.mirror[1] < 0,
    handle.includes("n"),
    handle.includes("s"),
    dy,
  )
  const width = xa.hi - xa.lo
  const height = ya.hi - ya.lo
  // The box rotates about its own centre, so re-seat it from the new centre to
  // keep the surviving pixels fixed in world space.
  const shift = {
    x: xa.lo + width / 2 - origin.width / 2,
    y: ya.lo + height / 2 - origin.height / 2,
  }
  const center = pointAdd(boundsCenter(origin), rotatePoint(shift, ORIGIN, origin.angle))
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    crop: { x: xa.start, y: ya.start, width: xa.span, height: ya.span },
  }
}

/** Effect: merge `patch` into image `id` without recording history. */
const patchImageEffect = (id: string, patch: Partial<ExcalidrawImageElement>): ToolEffect => ({
  kind: "mutation",
  apply: (draft) =>
    updateElement(draft, id, (e) => (e.type === "image" ? { ...e, ...patch } : undefined)),
  skipHistory: true,
})

const buildCropMoveEffect = (
  id: string,
  origin: CropOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
  lockAspect = false,
): ToolEffect => patchImageEffect(id, computeCrop(origin, handle, start, at, lockAspect))

const buildCropRevertEffect = (id: string, origin: CropOrigin): ToolEffect => {
  const { x, y, width, height, crop } = origin
  return patchImageEffect(id, { x, y, width, height, crop })
}

const EXIT_CROP: ToolEffect = { kind: "setCrop", elementId: null }

export const reduceCropping = (
  state: Extract<SelectionState, { phase: "cropping" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  if (event.type === "escape") return [{ phase: "idle" }, [EXIT_CROP]]
  if (event.type === "pointerDown") {
    const elements = ctx.readElements()
    const handle = findHandleAt(event.at, ctx.selectedIds, elements, ctx.viewTransform)
    const e = elements.find((el) => el.id === state.elementId)
    if (handle?.kind === "resize" && handle.elementId === state.elementId && e?.type === "image") {
      return [
        {
          phase: "cropDragging",
          elementId: state.elementId,
          handle: handle.handle,
          origin: snapshotCrop(e),
          start: event.at,
        },
        [],
      ]
    }
  }
  if (event.type === "pointerDown" || event.type === "delete") {
    const [next, effects] = reduceIdle(event, ctx)
    return [next, [EXIT_CROP, ...effects]]
  }
  return [state, []]
}

export const reduceCropDragging = (
  state: Extract<SelectionState, { phase: "cropDragging" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  const back: SelectionState = { phase: "cropping", elementId: state.elementId }
  switch (event.type) {
    case "pointerMove":
      return [
        state,
        [
          buildCropMoveEffect(
            state.elementId,
            state.origin,
            state.handle,
            state.start,
            event.at,
            ctx.modifiers.shift,
          ),
        ],
      ]
    case "pointerUp":
      return [back, [buildRecommitEffect([state.elementId])]]
    case "escape":
      return [back, [buildCropRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}
