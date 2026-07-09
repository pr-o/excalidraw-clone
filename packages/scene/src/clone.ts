import type { ExcalidrawElement } from "./types"

/**
 * Deep-clones elements with fresh ids, rewriting every internal reference
 * (bindings, bound elements, container, frame, group membership) through the old->new id map.
 * References to ids outside the given set are left as-is. Positions are
 * untouched — callers offset separately.
 */
export function cloneElementsWithNewIds(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const idMap = new Map<string, string>()
  for (const el of elements) {
    idMap.set(el.id, crypto.randomUUID())
  }
  const remap = (id: string): string => idMap.get(id) ?? id
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

    if (next.frameId != null) {
      next.frameId = remap(next.frameId)
    }
    if (next.boundElements != null) {
      next.boundElements = next.boundElements.map((b) => ({ ...b, id: remap(b.id) }))
    }
    if (next.type === "arrow" || next.type === "line") {
      if (next.startBinding) {
        next.startBinding = { ...next.startBinding, elementId: remap(next.startBinding.elementId) }
      }
      if (next.endBinding) {
        next.endBinding = { ...next.endBinding, elementId: remap(next.endBinding.elementId) }
      }
    }
    if (next.type === "text" && next.containerId != null) {
      next.containerId = remap(next.containerId)
    }
    return next
  })
}
