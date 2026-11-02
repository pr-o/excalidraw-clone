import type { ExcalidrawElement } from "./types"

/** The live, unlocked elements among `ids`, in `ids` order; unknown ids are skipped. */
export const editableElements = (
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] => {
  const byId = new Map(elements.map((e) => [e.id, e]))
  return ids
    .map((id) => byId.get(id))
    .filter((e): e is ExcalidrawElement => !!e && !e.isDeleted && !e.locked)
}
