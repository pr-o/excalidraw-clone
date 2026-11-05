import type { Point } from "@excalidraw-clone/geometry"
import { newNote } from "@excalidraw-clone/scene"
import { addDraftEffect, commitDraftEffects, discardDraftEffect, patchDraftEffect } from "../draft"
import type { Tool, ToolEvent } from "../types"
import { CLICK_SLOP, computeBox } from "./shape"

export type NoteState =
  { phase: "idle" } | { phase: "drawing"; start: Point; containerId: string; textId: string }

/** Size of the note a plain click drops. */
const NOTE_DEFAULT_SIZE = 200

/** Sticky note: drag its box (or click for a default one), then type straight into it. */
export const noteTool: Tool<NoteState, ToolEvent> = {
  name: "note",
  initial: { phase: "idle" },
  reduce(state, event, ctx) {
    if (state.phase === "idle") {
      if (event.type !== "pointerDown") return [state, []]
      const { container, text } = newNote({ x: event.at.x, y: event.at.y, width: 0, height: 0 })
      return [
        { phase: "drawing", start: event.at, containerId: container.id, textId: text.id },
        [addDraftEffect(container, text)],
      ]
    }
    const { start, containerId, textId } = state
    switch (event.type) {
      case "pointerMove":
        return [state, [patchDraftEffect(containerId, computeBox(start, event.at, ctx.modifiers))]]
      case "pointerUp": {
        let box = computeBox(start, event.at, ctx.modifiers)
        if (box.width < CLICK_SLOP && box.height < CLICK_SLOP) {
          box = { x: start.x, y: start.y, width: NOTE_DEFAULT_SIZE, height: NOTE_DEFAULT_SIZE }
        }
        if (box.width === 0 || box.height === 0) {
          return [{ phase: "idle" }, [discardDraftEffect(containerId, textId)]]
        }
        return [
          { phase: "idle" },
          [...commitDraftEffects(containerId, box), { kind: "startTextEdit", elementId: textId }],
        ]
      }
      case "escape":
        return [{ phase: "idle" }, [discardDraftEffect(containerId, textId)]]
      default:
        return [state, []]
    }
  },
}
