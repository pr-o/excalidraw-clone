import type { ToolEffect } from "../../types"

/** Commit for an interaction whose moves skipped history: a no-op re-emit of
 *  each element in `ids` pushes one fresh history snapshot. */
export const buildRecommitEffect = (ids: readonly string[]): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const set = new Set(ids)
    for (let i = 0; i < draft.length; i += 1) {
      const e = draft[i]!
      if (set.has(e.id)) draft[i] = { ...e }
    }
  },
})
