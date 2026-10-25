import { commentAnchorAt } from "@excalidraw-clone/scene"
import type { Tool, ToolEvent } from "../types"
import { NO_EFFECTS } from "../types"

export type CommentToolState = { phase: "idle" }

/** Click places a comment pin (anchored to the element under the pointer, if
 *  any) and hands off to the app's composer; the scene is never touched here.
 *  Fires on pointerUp so the mousedown focus change cannot blur the composer. */
export const commentTool: Tool<CommentToolState, ToolEvent> = {
  name: "comment",
  initial: { phase: "idle" },
  reduce(state, event, ctx) {
    if (event.type !== "pointerUp") return [state, NO_EFFECTS]
    return [
      state,
      [
        { kind: "placeComment", anchor: commentAnchorAt(event.at, ctx.hitTest(event.at)) },
        { kind: "switchTool", tool: "selection" },
      ],
    ]
  },
}
