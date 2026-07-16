import type { GridSnap, Point, ViewTransform } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

export type ToolName =
  | "selection"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "parallelogram"
  | "hexagon"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "eraser"
  | "frame"
  | "image"
  | "note"

export interface Modifiers {
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
}

export interface ToolContext {
  readElements(): readonly ExcalidrawElement[]
  hitTest(at: Point): ExcalidrawElement | null
  viewTransform: ViewTransform
  modifiers: Modifiers
  selectedIds: readonly string[]
  grid: GridSnap
}

export type ToolEvent =
  | { type: "pointerDown"; at: Point }
  | { type: "pointerMove"; at: Point }
  | { type: "pointerUp"; at: Point }
  | { type: "doubleClick"; at: Point }
  | { type: "escape" }
  | { type: "delete" }

export type ImageReadyEvent = {
  type: "imageReady"
  fileId: string
  mimeType: string
  width: number
  height: number
  at: Point
}

export type AnyToolEvent = ToolEvent | ImageReadyEvent

export type SceneMutation = (draft: ExcalidrawElement[]) => void

export type ToolEffect =
  | { kind: "mutation"; apply: SceneMutation; skipHistory?: boolean }
  | { kind: "select"; ids: readonly string[] }
  | { kind: "addToSelection"; ids: readonly string[] }
  | { kind: "removeFromSelection"; ids: readonly string[] }
  | { kind: "startTextEdit"; elementId: string }
  | { kind: "switchTool"; tool: ToolName }

export interface Tool<S, E = ToolEvent> {
  readonly name: ToolName
  readonly initial: S
  reduce(state: S, event: E, ctx: ToolContext): [S, readonly ToolEffect[]]
}

export const NO_EFFECTS: readonly ToolEffect[] = []
