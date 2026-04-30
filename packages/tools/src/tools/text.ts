import { newText } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"

export type TextState = { phase: "idle" } | { phase: "editing"; elementId: string }

const TEXT_INITIAL: TextState = { phase: "idle" }

export const textTool: Tool<TextState, ToolEvent> = {
  name: "text",
  initial: TEXT_INITIAL,
  reduce(state, event, _ctx: ToolContext): [TextState, readonly ToolEffect[]] {
    void _ctx
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
        const element = newText({ x: event.at.x, y: event.at.y })
        return [
          { phase: "editing", elementId: element.id },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                draft.push(element)
              },
            },
            { kind: "startTextEdit", elementId: element.id },
          ],
        ]
      }
      return [state, []]
    }
    if (event.type === "escape") return [{ phase: "idle" }, []]
    return [state, []]
  },
}
