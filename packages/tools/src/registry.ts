import { arrowTool } from "./tools/arrow"
import { diamondTool } from "./tools/diamond"
import { ellipseTool } from "./tools/ellipse"
import { eraserTool } from "./tools/eraser"
import { frameTool } from "./tools/frame"
import { freedrawTool } from "./tools/freedraw"
import { hexagonTool } from "./tools/hexagon"
import { imageTool } from "./tools/image"
import { lineTool } from "./tools/line"
import { noteTool } from "./tools/note"
import { parallelogramTool } from "./tools/parallelogram"
import { rectangleTool } from "./tools/rectangle"
import { selectionTool } from "./tools/selection"
import { textTool } from "./tools/text"
import { triangleTool } from "./tools/triangle"
import type { AnyToolEvent, Tool, ToolName } from "./types"

export const TOOLS: Record<ToolName, Tool<unknown, AnyToolEvent>> = {
  selection: selectionTool,
  rectangle: rectangleTool,
  ellipse: ellipseTool,
  diamond: diamondTool,
  triangle: triangleTool,
  parallelogram: parallelogramTool,
  hexagon: hexagonTool,
  line: lineTool,
  arrow: arrowTool,
  freedraw: freedrawTool,
  text: textTool,
  eraser: eraserTool,
  frame: frameTool,
  image: imageTool,
  note: noteTool,
}
