import { arrowTool } from "./tools/arrow"
import { commentTool } from "./tools/comment"
import { eraserTool } from "./tools/eraser"
import { freedrawTool } from "./tools/freedraw"
import { imageTool } from "./tools/image"
import { laserTool } from "./tools/laser"
import { lassoTool } from "./tools/lasso"
import { lineTool } from "./tools/line"
import { noteTool } from "./tools/note"
import { selectionTool } from "./tools/selection"
import {
  diamondTool,
  ellipseTool,
  frameTool,
  hexagonTool,
  octagonTool,
  parallelogramTool,
  pentagonTool,
  rectangleTool,
  triangleTool,
} from "./tools/shape"
import { tableTool } from "./tools/table"
import { textTool } from "./tools/text"
import type { AnyToolEvent, Tool, ToolName } from "./types"

export const TOOLS: Record<ToolName, Tool<unknown, AnyToolEvent>> = {
  selection: selectionTool,
  rectangle: rectangleTool,
  ellipse: ellipseTool,
  diamond: diamondTool,
  triangle: triangleTool,
  parallelogram: parallelogramTool,
  hexagon: hexagonTool,
  pentagon: pentagonTool,
  octagon: octagonTool,
  line: lineTool,
  arrow: arrowTool,
  freedraw: freedrawTool,
  text: textTool,
  eraser: eraserTool,
  frame: frameTool,
  image: imageTool,
  laser: laserTool,
  lasso: lassoTool,
  note: noteTool,
  table: tableTool,
  comment: commentTool,
}
