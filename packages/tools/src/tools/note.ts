import type { Point } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, newNote } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { computeBox } from "./shape"

export type NoteState =
  | { phase: "idle" }
  | { phase: "drawing"; start: Point; containerId: string; textId: string }

const NOTE_INITIAL: NoteState = { phase: "idle" }

const resizeBox = (
  draft: ExcalidrawElement[],
  id: string,
  box: { x: number; y: number; width: number; height: number },
): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i >= 0) draft[i] = { ...draft[i]!, ...box }
}

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
              apply: (draft) => resizeBox(draft, containerId, box),
              skipHistory: true,
            },
          ],
        ]
      }
      case "pointerUp": {
        const box = computeBox(start, event.at, ctx.modifiers)
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
            { kind: "mutation", apply: (draft) => resizeBox(draft, containerId, box) },
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
