import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME]

export {
  DEFAULT_BG_COLOR,
  DEFAULT_FILL_STYLE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_OPACITY,
  DEFAULT_ROUGHNESS,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
} from "./defaults"
export {
  newArrow,
  newDiamond,
  newEllipse,
  newFrame,
  newFreedraw,
  newImage,
  newLine,
  newRectangle,
  newText,
} from "./factories"
export type { NewElementInput, NewFrameInput, NewImageInput, NewTextInput } from "./factories"
export { getElementBounds } from "./bounds"
export { hitTestElement } from "./hit-test"
export type { HitTestOptions } from "./hit-test"
export { Scene } from "./scene"

export type {
  Arrowhead,
  BoundElement,
  ElementType,
  ExcalidrawAppStateSnapshot,
  ExcalidrawArrowElement,
  ExcalidrawBinaryFile,
  ExcalidrawData,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawElementBase,
  ExcalidrawEllipseElement,
  ExcalidrawFiles,
  ExcalidrawFrameElement,
  ExcalidrawFreedrawElement,
  ExcalidrawImageElement,
  ExcalidrawLineElement,
  ExcalidrawLinearBase,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
  FillStyle,
  FontFamily,
  PointBinding,
  Roughness,
  Roundness,
  StrokeStyle,
  StrokeWidth,
  TextAlign,
  VerticalAlign,
} from "./types"
