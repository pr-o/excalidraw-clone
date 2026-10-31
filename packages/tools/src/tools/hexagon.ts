import { newHexagon } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const hexagonTool = shapeTool("hexagon", (box) => newHexagon(box))
