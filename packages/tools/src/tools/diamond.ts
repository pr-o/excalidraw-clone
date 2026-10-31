import { newDiamond } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const diamondTool = shapeTool("diamond", (box) => newDiamond(box))
