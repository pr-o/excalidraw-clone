import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** Apply the end of a text-edit session to a mutation draft: commit non-empty
 *  text; an empty bound label is deleted and unlinked from its container. */
export function commitTextEdit(draft: ExcalidrawElement[], id: string, finalText: string): void {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  const el = draft[i]!
  if (el.type !== "text") return
  if (finalText === "" && el.containerId !== null) {
    draft.splice(i, 1)
    const ci = draft.findIndex((e) => e.id === el.containerId)
    if (ci >= 0) {
      const c = draft[ci]!
      const rest = (c.boundElements ?? []).filter((b) => b.id !== id)
      draft[ci] = { ...c, boundElements: rest.length > 0 ? rest : null }
    }
    return
  }
  draft[i] = { ...el, text: finalText }
}
