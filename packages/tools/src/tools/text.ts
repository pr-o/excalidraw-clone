import { newText } from "@excalidraw-clone/scene"
import { removeElement } from "../draft"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"

export type TextState = { phase: "idle" } | { phase: "placing"; elementId: string; existing?: true }

const TEXT_INITIAL: TextState = { phase: "idle" }

export const textTool: Tool<TextState, ToolEvent> = {
  name: "text",
  initial: TEXT_INITIAL,
  reduce(state, event, ctx: ToolContext): [TextState, readonly ToolEffect[]] {
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
        // Clicking existing text edits it rather than stacking a new text on top.
        const hit = ctx.hitTest(event.at)
        if (hit?.type === "text")
          return [{ phase: "placing", elementId: hit.id, existing: true }, []]
        const element = newText({ x: event.at.x, y: event.at.y })
        return [
          { phase: "placing", elementId: element.id },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                draft.push(element)
              },
              skipHistory: true,
            },
          ],
        ]
      }
      return [state, []]
    }
    const { elementId } = state
    if (event.type === "pointerUp") {
      return [{ phase: "idle" }, [{ kind: "startTextEdit", elementId }]]
    }
    if (event.type === "escape") {
      if (state.existing) return [{ phase: "idle" }, []]
      return [
        { phase: "idle" },
        [
          {
            kind: "mutation",
            apply: (draft) => removeElement(draft, elementId),
            skipHistory: true,
          },
        ],
      ]
    }
    return [state, []]
  },
}
