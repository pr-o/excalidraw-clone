import type { Point } from "@excalidraw-clone/geometry"
import {
  mirrorOf,
  type ExcalidrawElement,
  type ExcalidrawImageElement,
} from "@excalidraw-clone/scene"
import type { ToolEffect } from "../../types"
import type { ResizeHandle } from "./types"

export type Crop = NonNullable<ExcalidrawImageElement["crop"]>
export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 }
export const MIN_CROP_SIZE = 10

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

export const computeCrop = (
  origin: CropOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
): { x: number; y: number; width: number; height: number; crop: Crop } => {
  const c0 = origin.crop ?? FULL_CROP
  const cos = Math.cos(origin.angle)
  const sin = Math.sin(origin.angle)
  // Pointer travel in the image's local (unrotated) axes.
  const wx = at.x - start.x
  const wy = at.y - start.y
  const dx = wx * cos + wy * sin
  const dy = -wx * sin + wy * cos
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
  const ox = xa.lo + width / 2 - origin.width / 2
  const oy = ya.lo + height / 2 - origin.height / 2
  const cx = origin.x + origin.width / 2 + ox * cos - oy * sin
  const cy = origin.y + origin.height / 2 + ox * sin + oy * cos
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    crop: { x: xa.start, y: ya.start, width: xa.span, height: ya.span },
  }
}

const patchImage =
  (id: string, patch: Partial<ExcalidrawImageElement>) =>
  (draft: ExcalidrawElement[]): void => {
    const i = draft.findIndex((e) => e.id === id)
    const e = draft[i]
    if (i < 0 || !e || e.type !== "image") return
    draft[i] = { ...e, ...patch }
  }

export const buildCropMoveEffect = (
  id: string,
  origin: CropOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
): ToolEffect => ({
  kind: "mutation",
  apply: patchImage(id, computeCrop(origin, handle, start, at)),
  skipHistory: true,
})

export const buildCropCommitEffect = (id: string): ToolEffect => ({
  kind: "mutation",
  apply: patchImage(id, {}),
})

export const buildCropRevertEffect = (id: string, origin: CropOrigin): ToolEffect => ({
  kind: "mutation",
  apply: patchImage(id, {
    x: origin.x,
    y: origin.y,
    width: origin.width,
    height: origin.height,
    crop: origin.crop,
  }),
  skipHistory: true,
})
