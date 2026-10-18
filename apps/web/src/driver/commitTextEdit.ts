import { normalizeSpans, type ExcalidrawElement, type TextSpan } from "@excalidraw-clone/scene"

/** Apply the end of a text-edit session to a mutation draft: commit non-empty
 *  text. An empty bound label is always deleted and unlinked from its
 *  container. A free-standing (unbound) text element is deleted on an empty
 *  commit only if it never had content before this edit either (a fresh,
 *  never-typed-in text-tool placement) — clearing out *existing* content on
 *  a free text element keeps it, rather than deleting it.
 *
 *  `measuredSize` (the rendered size of `finalText`) is applied to a
 *  free-standing element's width/height so its hit-box tracks its content.
 *  Bound labels ignore it — reconcileBoundText sizes those from the container.
 *
 *  `spans` (bold/italic runs over finalText) are normalized against the final
 *  text and stored; none left ⟺ the field is removed. */
export function commitTextEdit(
  draft: ExcalidrawElement[],
  id: string,
  finalText: string,
  measuredSize?: { width: number; height: number },
  spans?: readonly TextSpan[],
): void {
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
  const clean = normalizeSpans(spans, finalText.length)
  const { spans: _old, ...base } = el
  const next = { ...base, text: finalText, ...(clean.length > 0 ? { spans: clean } : {}) }
  draft[i] =
    el.containerId === null && measuredSize
      ? { ...next, width: measuredSize.width, height: measuredSize.height }
      : next
}
