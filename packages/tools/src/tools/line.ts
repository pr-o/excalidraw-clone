import { newLine } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { LINEAR_INITIAL, type LinearState, linearReduce } from "./linear"

export const lineTool: Tool<LinearState, ToolEvent> = {
  name: "line",
  initial: LINEAR_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    return linearReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (start) => newLine({ x: start.x, y: start.y }),
    })
  },
}
