export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export type { Point, Vector, Bounds, LineSegment, ViewTransform } from "./types"
export {
  pointAdd,
  pointSubtract,
  pointScale,
  dot,
  cross,
  vectorLength,
  vectorLengthSq,
  pointDistance,
  pointDistanceSq,
  normalize,
} from "./vector"
export { clamp, lerp, degToRad, radToDeg } from "./scalar"
export { rotatePoint } from "./rotation"
export {
  boundsContainsPoint,
  boundsIntersect,
  boundsContains,
  boundsFromPoints,
  boundsCenter,
  boundsExpand,
} from "./bounds"
export { pointInRectangle, pointInEllipse, pointInDiamond } from "./hit-test"
export { distancePointToSegment, pointOnSegment } from "./segment"
export {
  fitToContent,
  sceneToViewport,
  viewportToScene,
  zoomToPoint,
  ZOOM_MIN,
  ZOOM_MAX,
} from "./transform"
export { snapPointToGrid } from "./snap"
export type { GridSnap, SnapModifiers } from "./snap"
export { computeAlignmentSnap } from "./alignment-guides"
export type { AlignmentGuide, AlignmentSnapResult, UserGuides } from "./alignment-guides"
export { hitTestUserGuide, rulerTickStep, rulerTicks, USER_GUIDE_HIT_TOLERANCE_PX } from "./rulers"
export type { RulerTick } from "./rulers"
export { edgePointToward } from "./binding-edge"
export type { EdgeKind } from "./binding-edge"
export {
  mirroredShapeVertices,
  pointInConvexPolygon,
  pointInPolygon,
  polygonIntersectsBounds,
  polygonEdgePointToward,
  shapeVertices,
} from "./polygon"
export type { PolygonShapeKind } from "./polygon"
export { labelInnerBox } from "./label-box"
export type { LabelShapeKind } from "./label-box"
export { polylineMidpoint } from "./polyline"
export {
  centerViewOn,
  minimapFit,
  minimapToScene,
  sceneToMinimap,
  viewportSceneRect,
} from "./minimap"
export type { MinimapFit } from "./minimap"
