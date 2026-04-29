export interface Point {
  readonly x: number
  readonly y: number
}

export type Vector = Point

export interface Bounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type LineSegment = readonly [Point, Point]

export interface ViewTransform {
  readonly scrollX: number
  readonly scrollY: number
  readonly zoom: number
}
