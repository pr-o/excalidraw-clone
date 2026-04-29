import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME, SCENE_NAME]
