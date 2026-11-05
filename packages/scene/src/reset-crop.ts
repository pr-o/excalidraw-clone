import { boundsCenter, pointAdd, rotatePoint } from "@excalidraw-clone/geometry"
import { mirrorOf } from "./flip"
import type { ExcalidrawElement, ExcalidrawImageElement } from "./types"

/** Replacement images with `crop` cleared and the box regrown to the full image.
 *  The visible pixels stay fixed in world space (the box rotates about its own
 *  centre, so it is re-seated from the new centre). Skips anything that is not
 *  a cropped, unlocked, live image. */
export function resetCrop(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawImageElement[] {
  const out: ExcalidrawImageElement[] = []
  for (const id of ids) {
    const e = elements.find((el) => el.id === id)
    if (!e || e.type !== "image" || e.isDeleted || e.locked) continue
    const c = e.crop
    if (!c || c.width <= 0 || c.height <= 0) continue
    const [mx, my] = mirrorOf(e)
    const W = e.width / c.width
    const H = e.height / c.height
    // Hidden strip left of / above the visible region, in screen-local px.
    const offX = (mx < 0 ? 1 - c.x - c.width : c.x) * W
    const offY = (my < 0 ? 1 - c.y - c.height : c.y) * H
    // The full image's centre, offset from the cropped box's centre (turned by the angle).
    const shift = { x: (W - e.width) / 2 - offX, y: (H - e.height) / 2 - offY }
    const c2 = pointAdd(boundsCenter(e), rotatePoint(shift, { x: 0, y: 0 }, e.angle))
    out.push({ ...e, x: c2.x - W / 2, y: c2.y - H / 2, width: W, height: H, crop: null })
  }
  return out
}
