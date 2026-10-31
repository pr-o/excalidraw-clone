import { newParallelogram } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const parallelogramTool = shapeTool("parallelogram", (box) => newParallelogram(box))
