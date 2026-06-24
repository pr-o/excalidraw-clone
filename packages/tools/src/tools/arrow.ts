import { newArrow } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { LINEAR_INITIAL, type LinearState, linearReduce } from "./linear"

export const arrowTool: Tool<LinearState, ToolEvent> = {
  name: "arrow",
  initial: LINEAR_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    return linearReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (start) => newArrow({ x: start.x, y: start.y }),
      bindTargets: ctx.readElements(),
    })
  },
}
