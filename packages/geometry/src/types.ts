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

/** A screen/scene axis: "x" is horizontal, "y" vertical. */
export type Axis = "x" | "y"

export interface ViewTransform {
  readonly scrollX: number
  readonly scrollY: number
  readonly zoom: number
}
