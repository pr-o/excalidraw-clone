import { newFrame } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const frameTool = shapeTool("frame", (box) => newFrame(box))
