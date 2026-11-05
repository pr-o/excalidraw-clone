import { newText } from "@excalidraw-clone/scene"
import { addDraftEffect, discardDraftEffect } from "../draft"
import type { Tool, ToolEffect, ToolEvent } from "../types"

export type TextState = { phase: "idle" } | { phase: "placing"; elementId: string; existing?: true }

const TEXT_INITIAL: TextState = { phase: "idle" }

export const textTool: Tool<TextState, ToolEvent> = {
  name: "text",
  initial: TEXT_INITIAL,
  reduce(state, event, ctx): [TextState, readonly ToolEffect[]] {
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
        // Clicking existing text edits it rather than stacking a new text on top.
        const hit = ctx.hitTest(event.at)
        if (hit?.type === "text")
          return [{ phase: "placing", elementId: hit.id, existing: true }, []]
        const element = newText({ x: event.at.x, y: event.at.y })
        return [{ phase: "placing", elementId: element.id }, [addDraftEffect(element)]]
      }
      return [state, []]
    }
    const { elementId } = state
    if (event.type === "pointerUp") {
      // Like the other tools, hand back to selection (the toolbar lock vetoes this).
      return [
        { phase: "idle" },
        [
          { kind: "switchTool", tool: "selection" },
          { kind: "startTextEdit", elementId },
        ],
      ]
    }
    if (event.type === "escape") {
      if (state.existing) return [{ phase: "idle" }, []]
      return [{ phase: "idle" }, [discardDraftEffect(elementId)]]
    }
    return [state, []]
  },
}
