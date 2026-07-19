import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** Apply a frame rename to a mutation draft: trim the input, empty → null.
 *  Returns whether anything changed so the caller can skip history on no-ops. */
export function renameFrame(draft: ExcalidrawElement[], id: string, rawName: string): boolean {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return false
  const el = draft[i]!
  if (el.type !== "frame") return false
  const trimmed = rawName.trim()
  const name = trimmed === "" ? null : trimmed
  if (el.name === name) return false
  draft[i] = { ...el, name }
  return true
}
