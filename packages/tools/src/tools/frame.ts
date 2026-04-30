import { boundsContains } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, getElementBounds, newFrame } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { SHAPE_INITIAL, type ShapeState, computeBox, shapeReduce } from "./shape"

const populateFrameMembers = (draft: ExcalidrawElement[], frameId: string): void => {
  const frame = draft.find((e) => e.id === frameId)
  if (!frame || frame.type !== "frame") return
  const frameBounds = { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (e.id === frameId) continue
    if (e.type === "frame") continue
    if (e.frameId !== null) continue
    const eb = getElementBounds(e)
    if (boundsContains(frameBounds, eb)) {
      draft[i] = { ...e, frameId }
    }
  }
}

export const frameTool: Tool<ShapeState, ToolEvent> = {
  name: "frame",
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    const result = shapeReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (box) => newFrame(box),
    })
    // After a successful create (pointerUp with non-zero area), shapeReduce emits
    // a final mutation followed by select + switchTool. We extend the final mutation
    // to also populate frameId on every contained element.
    if (state.phase !== "drawing" || event.type !== "pointerUp") return result
    const box = computeBox(state.start, event.at, ctx.modifiers)
    if (box.width === 0 || box.height === 0) return result
    const id = state.elementId
    const [next, effects] = result
    const augmented = effects.map((eff) => {
      if (eff.kind !== "mutation" || eff.skipHistory) return eff
      return {
        ...eff,
        apply: (draft: ExcalidrawElement[]) => {
          eff.apply(draft)
          populateFrameMembers(draft, id)
        },
      }
    })
    return [next, augmented]
  },
}
