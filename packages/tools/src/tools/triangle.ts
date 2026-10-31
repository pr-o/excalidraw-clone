import { newTriangle } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const triangleTool = shapeTool("triangle", (box) => newTriangle(box))
