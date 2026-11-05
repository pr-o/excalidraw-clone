import type { ExcalidrawElement, ExcalidrawElementBase } from "./types"

export type HistoryChangeCategory =
  "initial" | "added" | "removed" | "moved" | "resized" | "restyled" | "reordered" | "modified"

export interface HistoryChangeDescription {
  category: HistoryChangeCategory
  count: number
}

const STYLE_FIELDS: readonly (keyof ExcalidrawElementBase)[] = [
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "gradient",
  "shadow",
]

const VOLATILE_FIELDS = ["versionNonce", "updated"] as const

type ElementCategory =
  "added" | "removed" | "moved" | "resized" | "restyled" | "modified" | "unchanged"

/** The subset of `ElementCategory` that represents an actual change. */
type ChangedElementCategory = Exclude<ElementCategory, "unchanged">

function isLive(el: ExcalidrawElement | undefined): el is ExcalidrawElement {
  return el !== undefined && !el.isDeleted
}

function stripFields(el: ExcalidrawElement, fields: readonly string[]): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...el }
  for (const field of fields) delete clone[field]
  return clone
}

/** Value equality of two elements, ignoring `fields`. */
const sameExcept = (
  a: ExcalidrawElement,
  b: ExcalidrawElement,
  fields: readonly string[],
): boolean => JSON.stringify(stripFields(a, fields)) === JSON.stringify(stripFields(b, fields))

function isPureTranslation(
  prevPoints: readonly { x: number; y: number }[],
  nextPoints: readonly { x: number; y: number }[],
): boolean {
  if (prevPoints.length !== nextPoints.length || prevPoints.length === 0) return false
  const dx = nextPoints[0]!.x - prevPoints[0]!.x
  const dy = nextPoints[0]!.y - prevPoints[0]!.y
  return prevPoints.every((p, i) => nextPoints[i]!.x - p.x === dx && nextPoints[i]!.y - p.y === dy)
}

const GEOMETRY_AND_STYLE = [
  "x",
  "y",
  "width",
  "height",
  "points",
  ...STYLE_FIELDS,
  ...VOLATILE_FIELDS,
]

function classifyElementDiff(
  prev: ExcalidrawElement | undefined,
  next: ExcalidrawElement | undefined,
): ElementCategory {
  // Same object ⟹ nothing changed (snapshots share untouched elements).
  if (prev === next) return "unchanged"
  if (!isLive(prev)) return isLive(next) ? "added" : "unchanged"
  if (!isLive(next)) return "removed"

  if (!sameExcept(prev, next, GEOMETRY_AND_STYLE)) return "modified"

  const positionChanged = prev.x !== next.x || prev.y !== next.y
  const sizeChanged = prev.width !== next.width || prev.height !== next.height
  let pointsChanged = false
  let pointsTranslated = true
  if ("points" in prev && "points" in next) {
    pointsChanged = JSON.stringify(prev.points) !== JSON.stringify(next.points)
    if (pointsChanged) pointsTranslated = isPureTranslation(prev.points, next.points)
  }
  const styleChanged = STYLE_FIELDS.some((f) => prev[f] !== next[f])
  const geometryChanged = positionChanged || sizeChanged || pointsChanged

  if (geometryChanged && styleChanged) return "modified"
  if (styleChanged) return "restyled"
  if (geometryChanged) {
    if (sizeChanged || (pointsChanged && !pointsTranslated)) return "resized"
    return "moved"
  }
  return "unchanged"
}

/** Snapshots are immutable, so a (prev, next) pair's description never changes;
 *  the history panel re-describes all ~100 entries on every new commit. */
const cache = new WeakMap<
  readonly ExcalidrawElement[],
  { prev: readonly ExcalidrawElement[] | undefined; result: HistoryChangeDescription }
>()

export function describeHistoryChange(
  prev: readonly ExcalidrawElement[] | undefined,
  next: readonly ExcalidrawElement[],
): HistoryChangeDescription {
  const hit = cache.get(next)
  if (hit && hit.prev === prev) return hit.result
  const result = describeUncached(prev, next)
  cache.set(next, { prev, result })
  return result
}

function describeUncached(
  prev: readonly ExcalidrawElement[] | undefined,
  next: readonly ExcalidrawElement[],
): HistoryChangeDescription {
  if (prev === undefined) {
    return { category: "initial", count: next.filter((e) => !e.isDeleted).length }
  }

  const prevMap = new Map(prev.map((e) => [e.id, e]))
  const nextMap = new Map(next.map((e) => [e.id, e]))
  const sameIdSet = prev.length === next.length && prev.every((e) => nextMap.has(e.id))

  if (sameIdSet) {
    const allFieldsEqual = next.every((e) => {
      const before = prevMap.get(e.id)!
      return before === e || sameExcept(before, e, VOLATILE_FIELDS)
    })
    if (allFieldsEqual) {
      const orderChanged = prev.some((e, i) => e.id !== next[i]!.id)
      return orderChanged
        ? { category: "reordered", count: next.length }
        : { category: "modified", count: 0 }
    }
  }

  const allIds = new Set([...prevMap.keys(), ...nextMap.keys()])

  const categories: ChangedElementCategory[] = []
  for (const id of allIds) {
    const category = classifyElementDiff(prevMap.get(id), nextMap.get(id))
    if (category !== "unchanged") categories.push(category)
  }

  if (categories.length === 0) return { category: "modified", count: 0 }

  const unique = new Set(categories)
  if (unique.size === 1) {
    return { category: categories[0]!, count: categories.length }
  }
  return { category: "modified", count: categories.length }
}
