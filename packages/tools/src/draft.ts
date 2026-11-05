import { patchElement, type ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "./types"

/** Splice the draft element with `id` out; no-op when absent. */
const removeElement = (draft: ExcalidrawElement[], id: string): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i >= 0) draft.splice(i, 1)
}

/** Effect: append `elements` to the scene as live (not-yet-committed) drafts. */
export const addDraftEffect = (...elements: ExcalidrawElement[]): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    draft.push(...elements)
  },
  skipHistory: true,
})

/** Effect: update the in-progress element `id` without recording history. */
export const patchDraftEffect = (id: string, patch: Partial<ExcalidrawElement>): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => patchElement(draft, id, patch),
  skipHistory: true,
})

/** Effect: throw away the in-progress elements `ids` without recording history. */
export const discardDraftEffect = (...ids: string[]): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    for (const id of ids) removeElement(draft, id)
  },
  skipHistory: true,
})

/** Effects that finish a drawing gesture: select the new element and return to the selection tool. */
export const selectAndSwitchEffects = (id: string): readonly ToolEffect[] => [
  { kind: "select", ids: [id] },
  { kind: "switchTool", tool: "selection" },
]

/** Effects that commit the in-progress element `id`: its final `patch` (recorded in
 *  history, unlike the draft frames before it), then select it and switch back. */
export const commitDraftEffects = (
  id: string,
  patch: Partial<ExcalidrawElement>,
): readonly ToolEffect[] => [
  { kind: "mutation", apply: (draft) => patchElement(draft, id, patch) },
  ...selectAndSwitchEffects(id),
]
