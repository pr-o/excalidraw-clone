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
    const ox = (W - e.width) / 2 - offX
    const oy = (H - e.height) / 2 - offY
    const cos = Math.cos(e.angle)
    const sin = Math.sin(e.angle)
    const cx = e.x + e.width / 2 + ox * cos - oy * sin
    const cy = e.y + e.height / 2 + ox * sin + oy * cos
    out.push({ ...e, x: cx - W / 2, y: cy - H / 2, width: W, height: H, crop: null })
  }
  return out
}
