import { newOctagon } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const octagonTool = shapeTool("octagon", (box) => newOctagon(box))
