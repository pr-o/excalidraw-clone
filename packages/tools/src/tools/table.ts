import type { Point } from "@excalidraw-clone/geometry"
import {
  newTable,
  TABLE_DEFAULT_COL,
  TABLE_DEFAULT_COLS,
  TABLE_DEFAULT_ROW,
  TABLE_DEFAULT_ROWS,
  TABLE_MIN_COL,
  TABLE_MIN_ROW,
} from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { computeBox, SHAPE_INITIAL, type ShapeState, shapeReduce } from "./shape"

/** A press-release shorter than this (px, both axes) is a click, not a drag. */
const CLICK_SLOP = 4

const signed = (d: number, size: number): number => (d < 0 ? -size : size)

/** Draw a table by dragging its box (split evenly into 3x3, grown to the
 *  minimum cell size); a plain click drops the default-size table. Shift is
 *  ignored: a square box makes no sense for a table. */
export const tableTool: Tool<ShapeState, ToolEvent> = {
  name: "table",
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    const modifiers = { ...ctx.modifiers, shift: false }
    let routed: ToolEvent = event
    if (state.phase === "drawing" && event.type === "pointerUp") {
      const { start } = state
      const alt = modifiers.alt
      let dx = event.at.x - start.x
      let dy = event.at.y - start.y
      const box = computeBox(start, event.at, modifiers)
      let at: Point = event.at
      if (box.width < CLICK_SLOP && box.height < CLICK_SLOP) {
        dx = TABLE_DEFAULT_COL * TABLE_DEFAULT_COLS
        dy = TABLE_DEFAULT_ROW * TABLE_DEFAULT_ROWS
        at = { x: start.x + (alt ? dx / 2 : dx), y: start.y + (alt ? dy / 2 : dy) }
      } else {
        const k = alt ? 2 : 1
        const minW = TABLE_DEFAULT_COLS * TABLE_MIN_COL
        const minH = TABLE_DEFAULT_ROWS * TABLE_MIN_ROW
        at = {
          x: box.width < minW ? start.x + signed(dx, minW / k) : at.x,
          y: box.height < minH ? start.y + signed(dy, minH / k) : at.y,
        }
      }
      routed = { type: "pointerUp", at }
    }
    return shapeReduce({
      state,
      event: routed,
      modifiers,
      factory: (box) => newTable(box),
    })
  },
}
