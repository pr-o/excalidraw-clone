import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME]

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
