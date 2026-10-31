import { newPentagon } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const pentagonTool = shapeTool("pentagon", (box) => newPentagon(box))
