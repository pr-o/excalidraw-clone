import { newOctagon } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { SHAPE_INITIAL, type ShapeState, shapeReduce } from "./shape"

export const octagonTool: Tool<ShapeState, ToolEvent> = {
  name: "octagon",
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    return shapeReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (box) => newOctagon(box),
    })
  },
}
