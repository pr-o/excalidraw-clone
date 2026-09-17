import { type ExcalidrawElement, newText } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"

export type TextState = { phase: "idle" } | { phase: "placing"; elementId: string }

const TEXT_INITIAL: TextState = { phase: "idle" }

const removeById = (draft: ExcalidrawElement[], id: string): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i >= 0) draft.splice(i, 1)
}

export const textTool: Tool<TextState, ToolEvent> = {
  name: "text",
  initial: TEXT_INITIAL,
  reduce(state, event, _ctx: ToolContext): [TextState, readonly ToolEffect[]] {
    void _ctx
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
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
      return [
        { phase: "idle" },
        [
          {
            kind: "mutation",
            apply: (draft) => removeById(draft, elementId),
            skipHistory: true,
          },
        ],
      ]
    }
    return [state, []]
  },
}
