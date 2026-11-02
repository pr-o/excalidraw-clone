import type { ExcalidrawElement, ExcalidrawElementBase } from "./types"

export type HistoryChangeCategory =
  | "initial"
  | "added"
  | "removed"
  | "moved"
  | "resized"
  | "restyled"
  | "reordered"
  | "modified"

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
  | "added"
  | "removed"
  | "moved"
  | "resized"
  | "restyled"
  | "modified"
  | "unchanged"

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

function isPureTranslation(
  prevPoints: readonly { x: number; y: number }[],
  nextPoints: readonly { x: number; y: number }[],
): boolean {
  if (prevPoints.length !== nextPoints.length || prevPoints.length === 0) return false
  const dx = nextPoints[0]!.x - prevPoints[0]!.x
  const dy = nextPoints[0]!.y - prevPoints[0]!.y
  return prevPoints.every((p, i) => nextPoints[i]!.x - p.x === dx && nextPoints[i]!.y - p.y === dy)
}

function otherFieldsChanged(prev: ExcalidrawElement, next: ExcalidrawElement): boolean {
  const ignored = ["x", "y", "width", "height", "points", ...STYLE_FIELDS, ...VOLATILE_FIELDS]
  return JSON.stringify(stripFields(prev, ignored)) !== JSON.stringify(stripFields(next, ignored))
}

function classifyElementDiff(
  prev: ExcalidrawElement | undefined,
  next: ExcalidrawElement | undefined,
): ElementCategory {
  // Same object ⟹ nothing changed (snapshots share untouched elements).
  if (prev === next) return "unchanged"
  const prevLive = isLive(prev)
  const nextLive = isLive(next)
  if (!prevLive && nextLive) return "added"
  if (prevLive && !nextLive) return "removed"
  if (!prevLive && !nextLive) return "unchanged"

  const p = prev as ExcalidrawElement
  const n = next as ExcalidrawElement

  if (otherFieldsChanged(p, n)) return "modified"

  const positionChanged = p.x !== n.x || p.y !== n.y
  const sizeChanged = p.width !== n.width || p.height !== n.height
  let pointsChanged = false
  let pointsTranslated = true
  if ("points" in p && "points" in n) {
    pointsChanged = JSON.stringify(p.points) !== JSON.stringify(n.points)
    if (pointsChanged) pointsTranslated = isPureTranslation(p.points, n.points)
  }
  const styleChanged = STYLE_FIELDS.some((f) => p[f] !== n[f])
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

  const prevIds = prev.map((e) => e.id)
  const nextIds = next.map((e) => e.id)
  const nextIdSet = new Set(nextIds)
  const sameIdSet = prevIds.length === nextIds.length && prevIds.every((id) => nextIdSet.has(id))

  if (sameIdSet) {
    const prevMap = new Map(prev.map((e) => [e.id, e]))
    const allFieldsEqual = next.every((e) => {
      const before = prevMap.get(e.id)!
      return (
        before === e ||
        JSON.stringify(stripFields(before, VOLATILE_FIELDS)) ===
          JSON.stringify(stripFields(e, VOLATILE_FIELDS))
      )
    })
    if (allFieldsEqual) {
      const orderChanged = prevIds.join("|") !== nextIds.join("|")
      if (orderChanged) return { category: "reordered", count: next.length }
      return { category: "modified", count: 0 }
    }
  }

  const prevMap = new Map(prev.map((e) => [e.id, e]))
  const nextMap = new Map(next.map((e) => [e.id, e]))
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
