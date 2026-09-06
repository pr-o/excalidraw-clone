import type { Tool, ToolEvent } from "../types"
import { NO_EFFECTS } from "../types"

export type LaserState = { phase: "idle" }

const LASER_INITIAL: LaserState = { phase: "idle" }

export const laserTool: Tool<LaserState, ToolEvent> = {
  name: "laser",
  initial: LASER_INITIAL,
  reduce(state, event) {
    if (event.type === "pointerDown" || event.type === "pointerMove") {
      return [state, [{ kind: "laserMove", at: event.at }]]
    }
    return [state, NO_EFFECTS]
  },
}
