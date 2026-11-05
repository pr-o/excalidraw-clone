import { expandIdsToFrameMembers } from "./frames"
import type { ExcalidrawElement, PointBinding } from "./types"

/**
 * Expands a selection to its copyable closure: frame members of any selected
 * frame, plus bound labels of everything included. Returns the matching
 * non-deleted elements in scene order, without duplicates.
 */
export function expandIdsToCopyClosure(
  ids: readonly string[],
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const withMembers = new Set(expandIdsToFrameMembers(ids, elements))
  const closure = new Set(withMembers)
  for (const el of elements) {
    if (el.isDeleted || !withMembers.has(el.id)) continue
    for (const b of el.boundElements ?? []) {
      if (b.type === "text") closure.add(b.id)
    }
  }
  return elements.filter((el) => !el.isDeleted && closure.has(el.id))
}

/**
 * Deep-clones elements with fresh ids, rewriting every internal reference
 * (bindings, bound elements, container, frame, group membership) through the old->new id map.
 * Arrow bindings and back-references to elements outside the given set are
 * dropped: a copy must not stay glued to (or claim) an original it was not
 * cloned with, or binding reconciliation would snap it back onto that
 * original. Other outside references (frame, container, group) are left
 * as-is. Positions are untouched — callers offset separately.
 */
export function cloneElementsWithNewIds(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const idMap = new Map<string, string>()
  for (const el of elements) {
    idMap.set(el.id, crypto.randomUUID())
  }
  const remap = (id: string): string => idMap.get(id) ?? id
  const remapBinding = (binding: PointBinding | null): PointBinding | null =>
    binding && idMap.has(binding.elementId)
      ? { ...binding, elementId: remap(binding.elementId) }
      : null
  const groupIdMap = new Map<string, string>()
  const remapGroup = (gid: string): string => {
    let next = groupIdMap.get(gid)
    if (next === undefined) {
      next = crypto.randomUUID()
      groupIdMap.set(gid, next)
    }
    return next
  }

  return elements.map((el) => {
    const next = { ...el, id: remap(el.id) }
    if (next.groupIds.length > 0) {
      next.groupIds = next.groupIds.map(remapGroup)
    }

    if (next.frameId !== null) {
      next.frameId = remap(next.frameId)
    }
    if (next.boundElements !== null) {
      const kept = next.boundElements.filter((b) => idMap.has(b.id))
      next.boundElements = kept.map((b) => ({ ...b, id: remap(b.id) }))
    }
    if (next.type === "arrow" || next.type === "line") {
      next.startBinding = remapBinding(next.startBinding)
      next.endBinding = remapBinding(next.endBinding)
    }
    if (next.type === "text" && next.containerId !== null) {
      next.containerId = remap(next.containerId)
    }
    return next
  })
}
