import {
  type Bounds,
  type EdgeKind,
  type Point,
  type PolygonShapeKind,
  boundsCenter,
  clamp,
  dot,
  edgePointToward,
  lerp,
  mirroredShapeVertices,
  normalize,
  pointAdd,
  pointDistance,
  pointScale,
  polygonEdgePointToward,
} from "@excalidraw-clone/geometry"
import { getElementBounds } from "./bounds"
import { routeElbow, sideCenter, sideOf, type Side } from "./elbow"
import { mirrorOf } from "./flip"
import { hitTestElement } from "./hit-test"
import { pointsPatch } from "./points-patch"
import { LABELABLE_TYPES } from "./reconcile-bound-text"
import type { ElementType, ExcalidrawArrowElement, ExcalidrawElement, PointBinding } from "./types"
import { isBoundLabel } from "./bound-label"

export const BINDING_GAP = 4
/** How far outside a shape's edge (scene px) an arrow endpoint still binds to it. */
const BINDING_PROXIMITY = 12

export const BINDABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  ...LABELABLE_TYPES,
  "image",
  "text",
  "table",
])

export const canBindTo = (el: ExcalidrawElement): boolean =>
  !el.isDeleted && BINDABLE_TYPES.has(el.type)

const edgeKindFor = (type: ElementType): EdgeKind =>
  type === "ellipse" ? "ellipse" : type === "diamond" ? "diamond" : "rect"

const polygonKindFor = (type: ElementType): PolygonShapeKind | null =>
  type === "triangle" ||
  type === "parallelogram" ||
  type === "hexagon" ||
  type === "pentagon" ||
  type === "octagon"
    ? type
    : null

/** The topmost shape an arrow end at `point` binds to: one under the point, else
 *  one whose edge is within BINDING_PROXIMITY (where users aim arrows). */
export const bindingTargetAt = (
  point: Point,
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement | null => {
  const candidates = elements
    .filter((el) => canBindTo(el) && !el.locked && !isBoundLabel(el))
    .reverse()
  const hit = candidates.find((el) => hitTestElement(el, point))
  if (hit) return hit
  // Near miss: step the point up to BINDING_PROXIMITY towards the shape's centre.
  const near = candidates.find((el) => {
    const center = boundsCenter(getElementBounds(el))
    const d = pointDistance(center, point)
    if (d === 0) return false
    const k = Math.min(BINDING_PROXIMITY, d) / d
    return hitTestElement(el, { x: lerp(point.x, center.x, k), y: lerp(point.y, center.y, k) })
  })
  return near ?? null
}

const perpHalfExtent = (bounds: Bounds, perp: Point): number =>
  (Math.abs(perp.x) * bounds.width) / 2 + (Math.abs(perp.y) * bounds.height) / 2

export const computeBoundEndpoint = (
  target: ExcalidrawElement,
  toward: Point,
  gap: number,
  focus = 0,
): Point => {
  const bounds = getElementBounds(target)
  const center = boundsCenter(bounds)
  const polyKind = polygonKindFor(target.type)
  const edge = polyKind
    ? polygonEdgePointToward(
        mirroredShapeVertices(polyKind, bounds, mirrorOf(target)),
        bounds,
        toward,
      )
    : edgePointToward(bounds, edgeKindFor(target.type), toward)
  const dir = normalize({ x: toward.x - center.x, y: toward.y - center.y })
  const base = pointAdd(edge, pointScale(dir, gap))
  if (focus === 0) return base
  const perp: Point = { x: -dir.y, y: dir.x }
  return pointAdd(base, pointScale(perp, focus * perpHalfExtent(bounds, perp)))
}

export const computeFocus = (target: ExcalidrawElement, endpoint: Point, toward: Point): number => {
  const bounds = getElementBounds(target)
  const center = boundsCenter(bounds)
  const dir = normalize({ x: toward.x - center.x, y: toward.y - center.y })
  if (dir.x === 0 && dir.y === 0) return 0
  const perp: Point = { x: -dir.y, y: dir.x }
  const halfPerp = perpHalfExtent(bounds, perp)
  if (halfPerp === 0) return 0
  const offset = { x: endpoint.x - center.x, y: endpoint.y - center.y }
  return clamp(dot(offset, perp) / halfPerp, -1, 1)
}

interface LiveBinding {
  binding: PointBinding
  target: ExcalidrawElement
}

/** The binding and its target, when the target still exists and can be bound to. */
const liveBinding = (
  binding: PointBinding | null,
  byId: Map<string, ExcalidrawElement>,
): LiveBinding | null => {
  const target = binding && byId.get(binding.elementId)
  return binding && target && canBindTo(target) ? { binding, target } : null
}

const centerOf = (el: ExcalidrawElement): Point => boundsCenter(getElementBounds(el))

const samePoints = (a: readonly Point[], b: readonly Point[]): boolean =>
  a.length === b.length && a.every((p, k) => p.x === b[k]!.x && p.y === b[k]!.y)

/** The arrow re-anchored to its absolute points, with the given bindings. */
const withAbsolutePoints = (
  arrow: ExcalidrawArrowElement,
  abs: readonly Point[],
  start: LiveBinding | null,
  end: LiveBinding | null,
): ExcalidrawArrowElement => ({
  ...arrow,
  ...pointsPatch(abs),
  startBinding: start?.binding ?? null,
  endBinding: end?.binding ?? null,
})

/** Elbow arrow: each bound end leaves its shape from the side facing the other end. */
const routeElbowArrow = (
  arrow: ExcalidrawArrowElement,
  abs: readonly Point[],
  start: LiveBinding | null,
  end: LiveBinding | null,
): ExcalidrawArrowElement | null => {
  let startAbs = abs[0]!
  let endAbs = abs[abs.length - 1]!
  const startRef = end ? centerOf(end.target) : endAbs
  const endRef = start ? centerOf(start.target) : startAbs
  let startSide: Side | null = null
  let endSide: Side | null = null
  if (start) {
    const b = getElementBounds(start.target)
    startSide = sideOf(boundsCenter(b), startRef)
    startAbs = sideCenter(b, startSide, start.binding.gap)
  }
  if (end) {
    const b = getElementBounds(end.target)
    endSide = sideOf(boundsCenter(b), endRef)
    endAbs = sideCenter(b, endSide, end.binding.gap)
  }
  const routed = routeElbow(startAbs, endAbs, startSide, endSide)
  return routed.length < 2 ? null : withAbsolutePoints(arrow, routed, start, end)
}

/** Straight or bent arrow: bound ends sit on the target's edge, facing the next point
 *  (or, for a straight arrow, the other end's target). Bend points stay put. */
const attachArrowEnds = (
  arrow: ExcalidrawArrowElement,
  abs: readonly Point[],
  start: LiveBinding | null,
  end: LiveBinding | null,
): ExcalidrawArrowElement => {
  let startAbs = abs[0]!
  let endAbs = abs[abs.length - 1]!
  const hasBends = abs.length > 2
  if (start) {
    const toward = hasBends ? abs[1]! : end ? centerOf(end.target) : endAbs
    const { gap, focus } = start.binding
    startAbs = computeBoundEndpoint(start.target, toward, gap, focus)
  }
  if (end) {
    const toward = hasBends ? abs[abs.length - 2]! : start ? centerOf(start.target) : startAbs
    const { gap, focus } = end.binding
    endAbs = computeBoundEndpoint(end.target, toward, gap, focus)
  }
  return withAbsolutePoints(arrow, [startAbs, ...abs.slice(1, -1), endAbs], start, end)
}

/** Mutate-time invariant: bound arrow ends follow their targets, bindings to gone
 *  or unbindable targets are dropped, and elbow arrows are re-routed. */
export const reconcileBindings = (draft: ExcalidrawElement[]): void => {
  const byId = new Map(draft.map((e) => [e.id, e]))
  for (let i = 0; i < draft.length; i += 1) {
    const arrow = draft[i]!
    if (arrow.type !== "arrow") continue
    if (!arrow.elbowed && !arrow.startBinding && !arrow.endBinding) continue

    const start = liveBinding(arrow.startBinding, byId)
    const end = liveBinding(arrow.endBinding, byId)
    const bindingsKept =
      (start?.binding ?? null) === arrow.startBinding && (end?.binding ?? null) === arrow.endBinding

    if (arrow.points.length < 2) {
      if (!bindingsKept) {
        draft[i] = {
          ...arrow,
          startBinding: start?.binding ?? null,
          endBinding: end?.binding ?? null,
        }
      }
      continue
    }
    const abs = arrow.points.map((p) => pointAdd(arrow, p))
    if (!arrow.elbowed) {
      draft[i] = attachArrowEnds(arrow, abs, start, end)
      continue
    }
    const routed = routeElbowArrow(arrow, abs, start, end)
    // Re-routing every arrow on every mutate would replace untouched ones: keep the
    // same object when nothing moved, so reference-comparing consumers stay cheap.
    if (
      routed &&
      !(
        bindingsKept &&
        routed.x === arrow.x &&
        routed.y === arrow.y &&
        samePoints(routed.points, arrow.points)
      )
    ) {
      draft[i] = routed
    }
  }
}
