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
  newHexagon,
  newImage,
  newLabelFor,
  newLabelForLinear,
  newLine,
  newNote,
  NOTE_BG_COLOR,
  newParallelogram,
  newRectangle,
  newText,
  newTriangle,
} from "./factories"
export type { NewElementInput, NewFrameInput, NewImageInput, NewTextInput } from "./factories"
export { getElementBounds } from "./bounds"
export { hitTestElement } from "./hit-test"
export type { HitTestOptions } from "./hit-test"
export { Scene } from "./scene"
export type { MutateOptions } from "./scene"
export type { LibraryItem } from "./library-item"
export { normalizeToOrigin } from "./normalize"
export { cloneElementsWithNewIds } from "./clone"
export { BUILTIN_TEMPLATES } from "./templates"
export { alignElements, distributeElements } from "./arrange"
export type { AlignEdge, DistributeAxis, PositionPatch } from "./arrange"
export { expandIdsToGroups, groupElements, ungroupElements } from "./groups"
export { lockElements, unlockAll } from "./locking"
export {
  LABELABLE_TYPES,
  LINEAR_LABELABLE_TYPES,
  NOTE_PADDING,
  reconcileBoundText,
} from "./reconcile-bound-text"
export {
  BINDABLE_TYPES,
  BINDING_GAP,
  bindingTargetAt,
  canBindTo,
  computeBoundEndpoint,
  computeFocus,
  reconcileBindings,
} from "./bindings"
export { SCENE_FORMAT_SOURCE, SCENE_FORMAT_VERSION, buildExcalidrawData } from "./json"

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
  ExcalidrawHexagonElement,
  ExcalidrawImageElement,
  ExcalidrawLineElement,
  ExcalidrawLinearBase,
  ExcalidrawParallelogramElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
  ExcalidrawTriangleElement,
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
