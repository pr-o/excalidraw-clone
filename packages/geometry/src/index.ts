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
export { sceneToViewport, viewportToScene } from "./transform"
