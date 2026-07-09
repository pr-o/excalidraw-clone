import type { ExcalidrawElement } from "./types"

/**
 * Expands ids to include every non-deleted element sharing a group with any
 * of them. Scene order is preserved; ids unknown to `elements` pass through.
 */
export function expandIdsToGroups(
  ids: readonly string[],
  elements: readonly ExcalidrawElement[],
): string[] {
  const idSet = new Set(ids)
  const groups = new Set<string>()
  for (const el of elements) {
    if (idSet.has(el.id) && !el.isDeleted) {
      for (const g of el.groupIds) groups.add(g)
    }
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const el of elements) {
    if (el.isDeleted) continue
    if (idSet.has(el.id) || el.groupIds.some((g) => groups.has(g))) {
      if (!seen.has(el.id)) {
        seen.add(el.id)
        result.push(el.id)
      }
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
  }
  return result
}

/** Returns patched copies of the matched elements, all assigned `groupId`.
 *  Empty array (no-op) when fewer than 2 elements match. */
export function groupElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  groupId: string,
): ExcalidrawElement[] {
  const idSet = new Set(ids)
  const matched = elements.filter((el) => idSet.has(el.id) && !el.isDeleted)
  if (matched.length < 2) return []
  return matched.map((el) => ({ ...el, groupIds: [groupId] }))
}

/** Returns patched copies of the matched grouped elements with membership cleared. */
export function ungroupElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] {
  const idSet = new Set(ids)
  return elements
    .filter((el) => idSet.has(el.id) && el.groupIds.length > 0)
    .map((el) => ({ ...el, groupIds: [] }))
}
