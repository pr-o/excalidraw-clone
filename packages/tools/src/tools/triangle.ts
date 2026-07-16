import { newTriangle } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { SHAPE_INITIAL, type ShapeState, shapeReduce } from "./shape"

export const triangleTool: Tool<ShapeState, ToolEvent> = {
  name: "triangle",
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    return shapeReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (box) => newTriangle(box),
    })
  },
}
