import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** Add an arrow back-reference to a target's boundElements (idempotent). */
export const addBackRef = (draft: ExcalidrawElement[], targetId: string, arrowId: string): void => {
  const j = draft.findIndex((e) => e.id === targetId)
  if (j < 0) return
  const t = draft[j]!
  const existing = t.boundElements ?? []
  if (existing.some((b) => b.id === arrowId)) return
  draft[j] = { ...t, boundElements: [...existing, { id: arrowId, type: "arrow" }] }
}

/** Remove an arrow back-reference from a target's boundElements. */
export const removeBackRef = (
  draft: ExcalidrawElement[],
  targetId: string,
  arrowId: string,
): void => {
  const j = draft.findIndex((e) => e.id === targetId)
  if (j < 0) return
  const t = draft[j]!
  if (!t.boundElements) return
  draft[j] = { ...t, boundElements: t.boundElements.filter((b) => b.id !== arrowId) }
}
