import { arrowTool } from "./tools/arrow"
import { diamondTool } from "./tools/diamond"
import { ellipseTool } from "./tools/ellipse"
import { eraserTool } from "./tools/eraser"
import { frameTool } from "./tools/frame"
import { freedrawTool } from "./tools/freedraw"
import { lineTool } from "./tools/line"
import { rectangleTool } from "./tools/rectangle"
import { selectionTool } from "./tools/selection"
import { textTool } from "./tools/text"
import type { Tool, ToolEvent, ToolName } from "./types"

export const TOOLS: Record<ToolName, Tool<unknown, ToolEvent>> = {
  selection: selectionTool,
  rectangle: rectangleTool,
  ellipse: ellipseTool,
  diamond: diamondTool,
  line: lineTool,
  arrow: arrowTool,
  freedraw: freedrawTool,
  text: textTool,
  eraser: eraserTool,
  frame: frameTool,
}
