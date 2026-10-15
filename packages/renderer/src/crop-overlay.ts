import type { ViewTransform } from "@excalidraw-clone/geometry"
import { mirrorOf, type ExcalidrawImageElement } from "@excalidraw-clone/scene"

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
): void => {
  const c = el.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  const kx = el.width / c.width
  const ky = el.height / c.height
  const [mx, my] = mirrorOf(el)
  ctx.save()
  ctx.globalCompositeOperation = "destination-over"
  ctx.setTransform(view.zoom, 0, 0, view.zoom, view.scrollX * view.zoom, view.scrollY * view.zoom)
  ctx.translate(el.x, el.y)
  if (el.angle !== 0) {
    ctx.translate(el.width / 2, el.height / 2)
    ctx.rotate(el.angle)
    ctx.translate(-el.width / 2, -el.height / 2)
  }
  if (mx !== 1 || my !== 1) {
    ctx.translate(el.width / 2, el.height / 2)
    ctx.scale(mx, my)
    ctx.translate(-el.width / 2, -el.height / 2)
  }
  ctx.beginPath()
  ctx.rect(-c.x * kx, -c.y * ky, kx, ky)
  ctx.rect(0, 0, el.width, el.height)
  ctx.clip("evenodd")
  ctx.globalAlpha = DIM_ALPHA
  ctx.drawImage(img, -c.x * kx, -c.y * ky, kx, ky)
  ctx.restore()
}
