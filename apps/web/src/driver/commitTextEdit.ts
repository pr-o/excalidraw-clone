import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** Apply the end of a text-edit session to a mutation draft: commit non-empty
 *  text. An empty bound label is always deleted and unlinked from its
 *  container. A free-standing (unbound) text element is deleted on an empty
 *  commit only if it never had content before this edit either (a fresh,
 *  never-typed-in text-tool placement) — clearing out *existing* content on
 *  a free text element keeps it, rather than deleting it. */
export function commitTextEdit(draft: ExcalidrawElement[], id: string, finalText: string): void {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  const el = draft[i]!
  if (el.type !== "text") return
  if (finalText === "" && (el.containerId !== null || el.text === "")) {
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
