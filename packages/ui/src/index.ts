import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
import { PACKAGE_NAME as TOOLS_NAME } from "@excalidraw-clone/tools"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [SCENE_NAME, TOOLS_NAME]

export { Toolbar } from "./Toolbar"
export type { ToolbarProps } from "./Toolbar"
export { PropertiesPanel } from "./PropertiesPanel"
export type { PropertiesPanelProps } from "./PropertiesPanel"
export { HamburgerMenu } from "./HamburgerMenu"
export type { HamburgerMenuProps, Locale, Theme } from "./HamburgerMenu"
