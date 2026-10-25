import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME]

export {
  DEFAULT_BG_COLOR,
  DEFAULT_FILL_STYLE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_STYLE,
  DEFAULT_FONT_WEIGHT,
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
  newOctagon,
  newParallelogram,
  newPentagon,
  newRectangle,
  newTable,
  newText,
  newTriangle,
} from "./factories"
export { newPage } from "./pages"
export type {
  NewArrowInput,
  NewElementInput,
  NewFrameInput,
  NewImageInput,
  NewTableInput,
  NewTextInput,
} from "./factories"
export { ELBOW_STUB, routeElbow, sideCenter, sideOf, type Side } from "./elbow"
export { getElementBounds, getElementsBounds } from "./bounds"
export { computeStats } from "./stats"
export type { Stats } from "./stats"
export { describeHistoryChange } from "./describe-history-change"
export type { HistoryChangeCategory, HistoryChangeDescription } from "./describe-history-change"
export { hitTestElement } from "./hit-test"
export type { HitTestOptions } from "./hit-test"
export { Scene } from "./scene"
export type { MutateOptions } from "./scene"
export type { LibraryItem } from "./library-item"
export { normalizeToOrigin } from "./normalize"
export { cloneElementsWithNewIds, expandIdsToCopyClosure } from "./clone"
export { duplicateElements } from "./duplicate"
export {
  ARRAY_DUPLICATE_MAX_ELEMENTS,
  ARRAY_DUPLICATE_MAX_TRACKS,
  arrayDuplicate,
  type ArrayDuplicateOptions,
} from "./arrayDuplicate"
export { BUILTIN_TEMPLATES } from "./templates"
export { exportMermaidFlowchart, layoutFlowchart, parseMermaidFlowchart } from "./mermaid"
export type {
  MermaidDirection,
  MermaidEdge,
  MermaidEdgeStyle,
  MermaidFlowchart,
  MermaidNode,
  MermaidShape,
} from "./mermaid"
export { alignElements, distributeElements, tidyElements } from "./arrange"
export type { AlignEdge, DistributeAxis, PositionPatch } from "./arrange"
export { expandIdsToGroups, groupElements, ungroupElements } from "./groups"
export { expandIdsToFrameMembers, reconcileFrameMembership } from "./frames"
export { lockElements, unlockAll, unlockElements } from "./locking"
export { flipElements, mirrorOf } from "./flip"
export type { FlipAxis } from "./flip"
export { resetCrop } from "./reset-crop"
export { resizeElements } from "./resize-group"
export type { ResizeBounds } from "./resize-group"
export { bringForward, bringToFront, sendBackward, sendToBack } from "./z-order"
export {
  GRADIENT_TYPES,
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
  ExcalidrawOctagonElement,
  ExcalidrawPage,
  ExcalidrawParallelogramElement,
  ExcalidrawPentagonElement,
  ExcalidrawRectangleElement,
  ExcalidrawTableElement,
  ExcalidrawTextElement,
  ExcalidrawTriangleElement,
  FillStyle,
  FontFamily,
  Gradient,
  Shadow,
  PointBinding,
  Roughness,
  Roundness,
  SceneSnapshot,
  StrokeStyle,
  StrokeWidth,
  TextAlign,
  VerticalAlign,
} from "./types"
export { elementShadow, shadowMargin } from "./shadow"
export {
  applyBulletEdit,
  autoBullet,
  BULLET,
  diffEdit,
  enterOnBullet,
  flagsAt,
  hasSpans,
  normalizeSpans,
  rangeHasStyle,
  remapSpans,
  remapSpansForText,
  sanitizeSpans,
  sliceRuns,
  toggleSpanStyle,
} from "./spans"
export type {
  BulletEdit,
  EditResult,
  SpanFlags,
  SpanStyle,
  TextEdit,
  TextRun,
  TextSpan,
} from "./spans"
export {
  autoGrowRows,
  borderAtLocal,
  cellAtLocal,
  cellRect,
  cellSpansAt,
  deleteCol,
  deleteRow,
  fitTable,
  fitTableBox,
  flipTable,
  insertCol,
  insertRow,
  reconcileTables,
  sanitizeTable,
  setCellText,
  setTableMeasurer,
  setTrackSize,
  tableText,
  toTableLocal,
  TABLE_DEFAULT_COL,
  TABLE_DEFAULT_COLS,
  TABLE_DEFAULT_ROWS,
  TABLE_DEFAULT_ROW,
  TABLE_LINE_HEIGHT,
  TABLE_MAX_TRACKS,
  TABLE_MIN_COL,
  TABLE_MIN_ROW,
  TABLE_PAD_X,
  TABLE_PAD_Y,
} from "./table"
export type { CellRect, CellSpans, CountLines } from "./table"
export {
  addComment,
  commentAnchorAt,
  deleteComment,
  replyToComment,
  resolveCommentPosition,
  sanitizeComments,
  setCommentResolved,
} from "./comments"
export type { Comment, CommentAnchor, CommentReply } from "./comments"
