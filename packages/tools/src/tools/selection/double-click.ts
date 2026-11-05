import {
  patchElement,
  cellAtLocal,
  isLinearElement,
  LABELABLE_TYPES,
  newLabelFor,
  newLabelForLinear,
  toTableLocal,
} from "@excalidraw-clone/scene"
import type { Point } from "@excalidraw-clone/geometry"
import type { ToolContext } from "../../types"
import { buildBendRemoveEffect } from "./bend"
import { findHandleAt } from "./handles"
import type { Transition } from "./types"

export const reduceDoubleClick = (at: Point, ctx: ToolContext, targetId?: string): Transition => {
  const elements = ctx.readElements()
  const handle =
    targetId === undefined ? findHandleAt(at, ctx.selectedIds, elements, ctx.viewTransform) : null
  if (handle && handle.kind === "bend") {
    return [{ phase: "idle" }, [buildBendRemoveEffect(handle.elementId, handle.index)]]
  }
  if (handle && handle.kind === "resize") {
    const id = handle.elementId
    const e = elements.find((el) => el.id === id)
    if (e && e.type === "text" && e.containerId === null && e.autoResize === false) {
      // Double-clicking a side handle of wrapped text makes it auto-size again; the host
      // re-measures the natural width once autoResize flips back on.
      return [
        { phase: "idle" },
        [{ kind: "mutation", apply: (draft) => patchElement(draft, id, { autoResize: true }) }],
      ]
    }
  }
  const hit =
    targetId === undefined
      ? ctx.hitTest(at)
      : (elements.find((e) => e.id === targetId && !e.isDeleted) ?? null)
  if (hit) {
    const soleSelection = ctx.selectedIds.length === 1 && ctx.selectedIds[0] === hit.id
    if (hit.groupIds.length > 0 && !soleSelection) {
      return [{ phase: "idle" }, [{ kind: "select", ids: [hit.id] }]]
    }
    if (hit.type === "frame") {
      return [
        { phase: "idle" },
        [
          { kind: "select", ids: [hit.id] },
          { kind: "startTextEdit", elementId: hit.id },
        ],
      ]
    }
    if (hit.type === "text") {
      return [{ phase: "idle" }, [{ kind: "startTextEdit", elementId: hit.id }]]
    }
    if (hit.type === "table") {
      const cell = cellAtLocal(hit, toTableLocal(hit, at)) ?? { row: 0, col: 0 }
      return [
        { phase: "idle" },
        [
          { kind: "select", ids: [hit.id] },
          { kind: "startTextEdit", elementId: hit.id, cell },
        ],
      ]
    }
    if (hit.type === "image" && hit.fileId !== null) {
      return [
        { phase: "cropping", elementId: hit.id },
        [
          { kind: "select", ids: [hit.id] },
          { kind: "setCrop", elementId: hit.id },
        ],
      ]
    }
    const textRef = hit.boundElements?.find((b) => b.type === "text")
    if (textRef) {
      return [{ phase: "idle" }, [{ kind: "startTextEdit", elementId: textRef.id }]]
    }
    if (LABELABLE_TYPES.has(hit.type) || isLinearElement(hit)) {
      const label = isLinearElement(hit) ? newLabelForLinear(hit) : newLabelFor(hit)
      return [
        { phase: "idle" },
        [
          {
            kind: "mutation",
            apply: (draft) => {
              const i = draft.findIndex((e) => e.id === hit.id)
              if (i < 0) return
              const c = draft[i]!
              draft[i] = {
                ...c,
                boundElements: [...(c.boundElements ?? []), { id: label.id, type: "text" }],
              }
              draft.push(label)
            },
            skipHistory: true,
          },
          { kind: "select", ids: [hit.id] },
          { kind: "startTextEdit", elementId: label.id },
        ],
      ]
    }
  }
  return [{ phase: "idle" }, []]
}
