"use client"
import type { GridSnap } from "@excalidraw-clone/geometry"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
import {
  TOOLS,
  type AnyToolEvent,
  type EraserState,
  type LassoState,
  type LinearState,
  type Modifiers,
  type SelectionState,
  type ToolContext,
  type ToolName,
} from "@excalidraw-clone/tools"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import { applyEffects } from "./effects"
import { pickElementAtPoint } from "./hitTest"
import type { LaserTrail } from "./laserTrail"

export const NO_MODIFIERS: Modifiers = { shift: false, alt: false, ctrl: false, meta: false }

const SNAPPABLE_TOOLS: ReadonlySet<string> = new Set([
  "selection",
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "image",
])

/** Grid snapping in effect for the active tool. */
export const resolveGrid = (): GridSnap => {
  const s = useAppStore.getState()
  return {
    enabled: s.gridEnabled && SNAPPABLE_TOOLS.has(s.activeTool),
    size: s.gridSize,
  }
}

export type ToolDispatch = (event: AnyToolEvent, modifiers: Modifiers, toolName?: ToolName) => void

/** Runs `event` through a tool's reducer (the active one by default), stores
 *  its next state, applies its effects and mirrors gesture chrome (marquee,
 *  lasso/eraser trail, binding highlight) onto the renderer. */
export function createToolDispatch(
  scene: Scene,
  renderer: CanvasRenderer,
  laser: LaserTrail,
): ToolDispatch {
  return (event, modifiers, toolName = useAppStore.getState().activeTool) => {
    const store = useAppStore.getState()
    const tool = TOOLS[toolName]
    const currentState = store.toolStates[toolName] ?? tool.initial
    const ctx: ToolContext = {
      readElements: () => scene.getElements(),
      hitTest: (at) => pickElementAtPoint(scene.getElements(), at),
      viewTransform: viewOf(store),
      modifiers,
      selectedIds: store.selectedIds,
      grid: resolveGrid(),
      // Guides only snap while visible (they show and hide with the rulers).
      ...(store.rulersVisible ? { userGuides: scene.getGuides() } : {}),
    }
    const [next, effects] = tool.reduce(currentState, event, ctx)
    useAppStore.getState().setToolState(toolName, next)
    applyEffects(scene, effects, laser)
    if (toolName === "selection") {
      const sel = next as SelectionState
      renderer.setMarquee(sel.phase === "marquee" ? { start: sel.start, end: sel.current } : null)
    }
    if (toolName === "lasso") {
      const lasso = next as LassoState
      renderer.setLasso(lasso.phase === "drawing" ? lasso.points : [])
    }
    if (toolName === "eraser") {
      const eraser = next as EraserState
      renderer.setLasso(eraser.phase === "erasing" ? eraser.trail : [])
    }
    if (toolName === "arrow" && (next as LinearState).phase === "drawing") {
      const cand = (next as Extract<LinearState, { phase: "drawing" }>).endBindId
      renderer.setBindingHighlight(cand ? [cand] : [])
    } else if (toolName === "selection" && (next as SelectionState).phase === "endpointDragging") {
      const cand = (next as Extract<SelectionState, { phase: "endpointDragging" }>).candidateBindId
      renderer.setBindingHighlight(cand ? [cand] : [])
    } else {
      renderer.setBindingHighlight([])
    }
  }
}
