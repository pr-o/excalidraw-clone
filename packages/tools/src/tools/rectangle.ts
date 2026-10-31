import { newRectangle } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const rectangleTool = shapeTool("rectangle", (box) => newRectangle(box))
