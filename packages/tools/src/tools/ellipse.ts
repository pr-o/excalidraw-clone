import { newEllipse } from "@excalidraw-clone/scene"
import { shapeTool } from "./shape"

export const ellipseTool = shapeTool("ellipse", (box) => newEllipse(box))
