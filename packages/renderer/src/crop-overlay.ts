import type { ViewTransform } from "@excalidraw-clone/geometry"
import type { ExcalidrawImageElement } from "@excalidraw-clone/scene"
import { applyElementTransform } from "./draw-element"

const DIM_ALPHA = 0.35

/**
 * Crop mode: ghost the part of the image that the crop hides. Draws *behind*
 * whatever is already on the overlay (the selection handles) and clips to the
 * ring between the full image rect and the visible box.
 */
export const drawCropDim = (
  ctx: CanvasRenderingContext2D,
  el: ExcalidrawImageElement,
  img: HTMLImageElement,
  view: ViewTransform,
  pixelRatio = 1,
): void => {
  const c = el.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  const kx = el.width / c.width
  const ky = el.height / c.height
  ctx.save()
  ctx.globalCompositeOperation = "destination-over"
  const s = view.zoom * pixelRatio
  ctx.setTransform(s, 0, 0, s, view.scrollX * s, view.scrollY * s)
  applyElementTransform(ctx, el)
  ctx.beginPath()
  ctx.rect(-c.x * kx, -c.y * ky, kx, ky)
  ctx.rect(0, 0, el.width, el.height)
  ctx.clip("evenodd")
  ctx.globalAlpha = DIM_ALPHA
  ctx.drawImage(img, -c.x * kx, -c.y * ky, kx, ky)
  ctx.restore()
}
