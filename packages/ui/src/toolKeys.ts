import type { ToolName } from "@excalidraw-clone/tools"

/** Default single-key tool shortcuts, in Help/settings display order. */
export const DEFAULT_TOOL_KEYS = {
  selection: "v",
  rectangle: "r",
  ellipse: "o",
  diamond: "d",
  triangle: "3",
  parallelogram: "g",
  hexagon: "6",
  pentagon: "5",
  octagon: "8",
  table: "7",
  line: "l",
  arrow: "a",
  freedraw: "p",
  text: "t",
  image: "9",
  eraser: "e",
  frame: "f",
  note: "n",
  lasso: "s",
  laser: "k",
  comment: "c",
} as const satisfies Record<ToolName, string>
