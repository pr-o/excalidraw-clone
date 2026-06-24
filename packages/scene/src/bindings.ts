import {
  type EdgeKind,
  type Point,
  boundsCenter,
  edgePointToward,
  normalize,
  pointAdd,
  pointScale,
} from "@excalidraw-clone/geometry"
import { getElementBounds } from "./bounds"
import { hitTestElement } from "./hit-test"
import type { ElementType, ExcalidrawElement } from "./types"

export const BINDING_GAP = 4

export const BINDABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "rectangle",
  "diamond",
  "ellipse",
  "image",
  "text",
])

export const canBindTo = (el: ExcalidrawElement): boolean =>
  !el.isDeleted && BINDABLE_TYPES.has(el.type)

const edgeKindFor = (type: ElementType): EdgeKind =>
  type === "ellipse" ? "ellipse" : type === "diamond" ? "diamond" : "rect"

export const bindingTargetAt = (
  point: Point,
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement | null => {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i]!
    if (!canBindTo(el)) continue
    if (el.type === "text" && el.containerId !== null) continue
    if (hitTestElement(el, point)) return el
  }
  return null
}

export const computeBoundEndpoint = (
  target: ExcalidrawElement,
  toward: Point,
  gap: number,
): Point => {
  const bounds = getElementBounds(target)
  const center = boundsCenter(bounds)
  const edge = edgePointToward(bounds, edgeKindFor(target.type), toward)
  const dir = normalize({ x: toward.x - center.x, y: toward.y - center.y })
  return pointAdd(edge, pointScale(dir, gap))
}
