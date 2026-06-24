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
import type { ElementType, ExcalidrawElement, PointBinding } from "./types"

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

const liveTarget = (
  binding: PointBinding | null,
  byId: Map<string, ExcalidrawElement>,
): ExcalidrawElement | null => {
  if (!binding) return null
  const t = byId.get(binding.elementId)
  if (!t || !canBindTo(t)) return null
  return t
}

export const reconcileBindings = (draft: ExcalidrawElement[]): void => {
  const byId = new Map(draft.map((e) => [e.id, e]))
  for (let i = 0; i < draft.length; i += 1) {
    const arrow = draft[i]!
    if (arrow.type !== "arrow") continue
    if (!arrow.startBinding && !arrow.endBinding) continue

    const startTarget = liveTarget(arrow.startBinding, byId)
    const endTarget = liveTarget(arrow.endBinding, byId)
    const startBinding = startTarget ? arrow.startBinding : null
    const endBinding = endTarget ? arrow.endBinding : null

    const pts = arrow.points
    if (pts.length < 2) {
      if (startBinding !== arrow.startBinding || endBinding !== arrow.endBinding) {
        draft[i] = { ...arrow, startBinding, endBinding }
      }
      continue
    }

    let startAbs: Point = { x: arrow.x + pts[0]!.x, y: arrow.y + pts[0]!.y }
    let endAbs: Point = {
      x: arrow.x + pts[pts.length - 1]!.x,
      y: arrow.y + pts[pts.length - 1]!.y,
    }

    if (startTarget) {
      const toward = endTarget ? boundsCenter(getElementBounds(endTarget)) : endAbs
      startAbs = computeBoundEndpoint(startTarget, toward, startBinding!.gap)
    }
    if (endTarget) {
      const toward = startTarget ? boundsCenter(getElementBounds(startTarget)) : startAbs
      endAbs = computeBoundEndpoint(endTarget, toward, endBinding!.gap)
    }

    const minX = Math.min(startAbs.x, endAbs.x)
    const minY = Math.min(startAbs.y, endAbs.y)
    draft[i] = {
      ...arrow,
      x: minX,
      y: minY,
      width: Math.abs(endAbs.x - startAbs.x),
      height: Math.abs(endAbs.y - startAbs.y),
      points: [
        { x: startAbs.x - minX, y: startAbs.y - minY },
        { x: endAbs.x - minX, y: endAbs.y - minY },
      ],
      startBinding,
      endBinding,
    }
  }
}
