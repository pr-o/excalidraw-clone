import type { ExcalidrawElement } from "./types"

/* In-place edits of a `Scene.mutate` draft. Elements are replaced, never mutated. */

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

/** Put each of `replacements` in place of the draft element with its id; draft
 *  elements without a replacement (and replacements without one) are left alone. */
export const replaceElements = (
  draft: ExcalidrawElement[],
  replacements: readonly ExcalidrawElement[],
): void => {
  const byId = new Map(replacements.map((e) => [e.id, e]))
  for (let i = 0; i < draft.length; i += 1) {
    const replacement = byId.get(draft[i]!.id)
    if (replacement) draft[i] = replacement
  }
}

/** Soft-delete (tombstone) the draft elements `ids`, keeping them for undo. */
export const deleteElements = (draft: ExcalidrawElement[], ids: readonly string[]): void => {
  const set = new Set(ids)
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (set.has(e.id) && !e.isDeleted) draft[i] = { ...e, isDeleted: true }
  }
}
