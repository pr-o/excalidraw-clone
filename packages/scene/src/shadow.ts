import type { ExcalidrawElement, Shadow } from "./types"
import { isBoundLabel } from "./bound-label"

/** The shadow that actually renders for `el`: frames and bound text labels never cast one. */
export const elementShadow = (el: ExcalidrawElement): Shadow | undefined =>
  el.type === "frame" || isBoundLabel(el) ? undefined : el.shadow

/** How far a rendered shadow can extend past the element on any side (scene units). */
export const shadowMargin = (el: ExcalidrawElement): number => {
  const s = elementShadow(el)
  return s ? s.blur + Math.max(Math.abs(s.offsetX), Math.abs(s.offsetY)) : 0
}
