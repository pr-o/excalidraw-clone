import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME, SCENE_NAME]

export { NO_EFFECTS } from "./types"
export { TOOLS } from "./registry"
export { rectangleTool } from "./tools/rectangle"
export { ellipseTool } from "./tools/ellipse"
export { diamondTool } from "./tools/diamond"
export type { ShapeState } from "./tools/shape"
export { lineTool } from "./tools/line"
export { arrowTool } from "./tools/arrow"
export type { LinearState } from "./tools/linear"
export { freedrawTool } from "./tools/freedraw"
export type { FreedrawState } from "./tools/freedraw"
export { textTool } from "./tools/text"
export type { TextState } from "./tools/text"
export { eraserTool } from "./tools/eraser"
export type { EraserState } from "./tools/eraser"
export { frameTool } from "./tools/frame"
export { imageTool } from "./tools/image"
export type { ImageEvent, ImageState } from "./tools/image"
export { noteTool } from "./tools/note"
export type { NoteState } from "./tools/note"
export { SELECTION_INITIAL, findHandleAt, selectionTool } from "./tools/selection"
export type { HandleHit, ResizeHandle, SelectionState } from "./tools/selection"
export type {
  AnyToolEvent,
  ImageReadyEvent,
  Modifiers,
  SceneMutation,
  Tool,
  ToolContext,
  ToolEffect,
  ToolEvent,
  ToolName,
} from "./types"
