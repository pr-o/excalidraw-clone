import { newImage } from "@excalidraw-clone/scene"
import {
  NO_EFFECTS,
  type AnyToolEvent,
  type Tool,
  type ToolContext,
  type ToolEffect,
} from "../types"

export type ImageEvent = AnyToolEvent

export type ImageState =
  | { phase: "idle" }
  | { phase: "placing"; fileId: string; mimeType: string; aspect: number }

const DEFAULT_PLACED_WIDTH = 200

export const imageTool: Tool<ImageState, ImageEvent> = {
  name: "image",
  initial: { phase: "idle" },
  reduce(state, event, _ctx: ToolContext): [ImageState, readonly ToolEffect[]] {
    void _ctx
    switch (event.type) {
      case "imageReady": {
        const aspect = event.height === 0 ? 1 : event.width / event.height
        return [
          { phase: "placing", fileId: event.fileId, mimeType: event.mimeType, aspect },
          NO_EFFECTS,
        ]
      }
      case "pointerDown": {
        if (state.phase !== "placing") return [state, NO_EFFECTS]
        const w = DEFAULT_PLACED_WIDTH
        const h = Math.round(w / state.aspect)
        const { fileId } = state
        const { at } = event
        return [
          { phase: "idle" },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                draft.push(newImage({ x: at.x, y: at.y, width: w, height: h, fileId }))
              },
            },
            { kind: "switchTool", tool: "selection" },
          ],
        ]
      }
      case "escape":
        return [{ phase: "idle" }, NO_EFFECTS]
      default:
        return [state, NO_EFFECTS]
    }
  },
}
