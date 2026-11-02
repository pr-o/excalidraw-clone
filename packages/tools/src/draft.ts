import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "./types"

/** Merge `patch` into the draft element with `id`; no-op when absent. */
export const patchElement = (
  draft: ExcalidrawElement[],
  id: string,
  patch: Partial<ExcalidrawElement>,
): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  draft[i] = { ...draft[i]!, ...patch } as ExcalidrawElement
}

/**
 * Replace the draft element with `id` by `fn(element)`. `fn` returns `undefined`
 * to leave it untouched; absent ids are a no-op. The element is handed over as
 * `T` (the caller knows which kind it targets), like the casts it replaces.
 */
export const updateElement = <T extends ExcalidrawElement = ExcalidrawElement>(
  draft: ExcalidrawElement[],
  id: string,
  fn: (el: T) => ExcalidrawElement | undefined,
): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  const next = fn(draft[i] as T)
  if (next) draft[i] = next
}

/** Splice the draft element with `id` out; no-op when absent. */
export const removeElement = (draft: ExcalidrawElement[], id: string): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i >= 0) draft.splice(i, 1)
}

/** Effect: append `element` to the scene as a live (not-yet-committed) draft. */
export const addDraftEffect = (element: ExcalidrawElement): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    draft.push(element)
  },
  skipHistory: true,
})

/** Effect: update the in-progress element `id` without recording history. */
export const patchDraftEffect = (id: string, patch: Partial<ExcalidrawElement>): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => patchElement(draft, id, patch),
  skipHistory: true,
})

/** Effect: throw away the in-progress element `id` without recording history. */
export const discardDraftEffect = (id: string): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => removeElement(draft, id),
  skipHistory: true,
})

/** Effects that finish a drawing gesture: select the new element and return to the selection tool. */
export const selectAndSwitchEffects = (id: string): readonly ToolEffect[] => [
  { kind: "select", ids: [id] },
  { kind: "switchTool", tool: "selection" },
]
