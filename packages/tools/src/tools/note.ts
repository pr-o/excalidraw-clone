import type { Point } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, newNote } from "@excalidraw-clone/scene"
import { patchElement } from "../draft"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { computeBox } from "./shape"

export type NoteState =
  { phase: "idle" } | { phase: "drawing"; start: Point; containerId: string; textId: string }

const NOTE_INITIAL: NoteState = { phase: "idle" }

/** A press-release shorter than this (px, both axes) is a click: it drops a default-size note. */
const CLICK_SLOP = 4
const NOTE_DEFAULT_SIZE = 200

const removeByIds = (draft: ExcalidrawElement[], ids: readonly string[]): void => {
  for (let i = draft.length - 1; i >= 0; i -= 1) {
    if (ids.includes(draft[i]!.id)) draft.splice(i, 1)
  }
}

export const noteTool: Tool<NoteState, ToolEvent> = {
  name: "note",
  initial: NOTE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
        const { container, text } = newNote({ x: event.at.x, y: event.at.y, width: 0, height: 0 })
        return [
          { phase: "drawing", start: event.at, containerId: container.id, textId: text.id },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                draft.push(container)
                draft.push(text)
              },
              skipHistory: true,
            },
          ],
        ]
      }
      return [state, []]
    }
    const { start, containerId, textId } = state
    switch (event.type) {
      case "pointerMove": {
        const box = computeBox(start, event.at, ctx.modifiers)
        return [
          state,
          [
            {
              kind: "mutation",
              apply: (draft) => patchElement(draft, containerId, box),
              skipHistory: true,
            },
          ],
        ]
      }
      case "pointerUp": {
        let box = computeBox(start, event.at, ctx.modifiers)
        if (box.width < CLICK_SLOP && box.height < CLICK_SLOP) {
          box = { x: start.x, y: start.y, width: NOTE_DEFAULT_SIZE, height: NOTE_DEFAULT_SIZE }
        }
        if (box.width === 0 || box.height === 0) {
          return [
            { phase: "idle" },
            [
              {
                kind: "mutation",
                apply: (draft) => removeByIds(draft, [containerId, textId]),
                skipHistory: true,
              },
            ],
          ]
        }
        return [
          { phase: "idle" },
          [
            { kind: "mutation", apply: (draft) => patchElement(draft, containerId, box) },
            { kind: "select", ids: [containerId] },
            { kind: "switchTool", tool: "selection" },
            { kind: "startTextEdit", elementId: textId },
          ],
        ]
      }
      case "escape":
        return [
          { phase: "idle" },
          [
            {
              kind: "mutation",
              apply: (draft) => removeByIds(draft, [containerId, textId]),
              skipHistory: true,
            },
          ],
        ]
      default:
        return [state, []]
    }
  },
}
