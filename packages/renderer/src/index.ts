import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME, SCENE_NAME]

export { CanvasRenderer } from "./renderer"
export type { CanvasRendererOptions, GridOptions, Theme } from "./types"
export type { MarqueeBox } from "./overlay"
export { resolveColor } from "./theme-colors"
export { renderToSVG } from "./svg"
export {
  fontFamilyName,
  fontSpec,
  layoutLabel,
  measureText,
  runFont,
  wrapLines,
  wrapRich,
} from "./text-metrics"
export type { SVGRenderOptions } from "./svg"
export { wrapCellText } from "./shapes/table"
export type { TableMeasure } from "./shapes/table"
