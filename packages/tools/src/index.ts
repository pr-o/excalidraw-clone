import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME, SCENE_NAME]

export { NO_EFFECTS } from "./types"
export { rectangleTool } from "./tools/rectangle"
export { ellipseTool } from "./tools/ellipse"
export { diamondTool } from "./tools/diamond"
export type { ShapeState } from "./tools/shape"
export { lineTool } from "./tools/line"
export { arrowTool } from "./tools/arrow"
export type { LinearState } from "./tools/linear"
export type {
  Modifiers,
  SceneMutation,
  Tool,
  ToolContext,
  ToolEffect,
  ToolEvent,
  ToolName,
} from "./types"
