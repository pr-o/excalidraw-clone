import type { ExcalidrawElement } from "@excalidraw-clone/scene"

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

/** Splice the draft element with `id` out; no-op when absent. */
export const removeElement = (draft: ExcalidrawElement[], id: string): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i >= 0) draft.splice(i, 1)
}
