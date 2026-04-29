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
