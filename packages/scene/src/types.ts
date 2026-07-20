import type { Point } from "@excalidraw-clone/geometry"

export type ElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "triangle"
  | "parallelogram"
  | "hexagon"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "frame"

export type FillStyle = "hachure" | "cross-hatch" | "solid"
export type StrokeStyle = "solid" | "dashed" | "dotted"
export type StrokeWidth = 1 | 2 | 4
export type Roughness = 0 | 1 | 2
export type FontFamily = 1 | 2 | 3
export type TextAlign = "left" | "center" | "right"
export type VerticalAlign = "top" | "middle" | "bottom"
export type Arrowhead =
  | "arrow"
  | "bar"
  | "dot"
  | "circle"
  | "cross"
  | "triangle"
  | "diamond"
  | "triangle_outline"
  | "circle_outline"
  | "diamond_outline"
export type Roundness = { type: 1 | 2 } | null

export interface PointBinding {
  elementId: string
  focus: number
  gap: number
  fixedPoint?: readonly [number, number]
}

export interface BoundElement {
  id: string
  type: "arrow" | "text"
}

export interface ExcalidrawElementBase {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  angle: number

  strokeColor: string
  backgroundColor: string
  fillStyle: FillStyle
  strokeWidth: StrokeWidth
  strokeStyle: StrokeStyle
  roughness: Roughness
  opacity: number

  groupIds: readonly string[]
  frameId: string | null
  roundness: Roundness

  seed: number
  versionNonce: number
  isDeleted: boolean

  boundElements: readonly BoundElement[] | null
  updated: number
  link: string | null
  locked: boolean
}

export interface ExcalidrawRectangleElement extends ExcalidrawElementBase {
  type: "rectangle"
}

export interface ExcalidrawDiamondElement extends ExcalidrawElementBase {
  type: "diamond"
}

export interface ExcalidrawEllipseElement extends ExcalidrawElementBase {
  type: "ellipse"
}

export interface ExcalidrawTriangleElement extends ExcalidrawElementBase {
  type: "triangle"
}

export interface ExcalidrawParallelogramElement extends ExcalidrawElementBase {
  type: "parallelogram"
}

export interface ExcalidrawHexagonElement extends ExcalidrawElementBase {
  type: "hexagon"
}

export interface ExcalidrawLinearBase extends ExcalidrawElementBase {
  points: readonly Point[]
  lastCommittedPoint: Point | null
  startBinding: PointBinding | null
  endBinding: PointBinding | null
  startArrowhead: Arrowhead | null
  endArrowhead: Arrowhead | null
}

export interface ExcalidrawLineElement extends ExcalidrawLinearBase {
  type: "line"
}

export interface ExcalidrawArrowElement extends ExcalidrawLinearBase {
  type: "arrow"
  elbowed: boolean
}

export interface ExcalidrawFreedrawElement extends ExcalidrawElementBase {
  type: "freedraw"
  points: readonly Point[]
  pressures: readonly number[]
  simulatePressure: boolean
  lastCommittedPoint: Point | null
}

export interface ExcalidrawTextElement extends ExcalidrawElementBase {
  type: "text"
  text: string
  fontSize: number
  fontFamily: FontFamily
  textAlign: TextAlign
  verticalAlign: VerticalAlign
  containerId: string | null
  originalText: string
  autoResize: boolean
  lineHeight: number
  baseline: number
}

export interface ExcalidrawImageElement extends ExcalidrawElementBase {
  type: "image"
  fileId: string | null
  status: "pending" | "saved" | "error"
  scale: readonly [number, number]
  crop: { x: number; y: number; width: number; height: number } | null
}

export interface ExcalidrawFrameElement extends ExcalidrawElementBase {
  type: "frame"
  name: string | null
  isCollapsed: boolean
}

export type ExcalidrawElement =
  | ExcalidrawRectangleElement
  | ExcalidrawDiamondElement
  | ExcalidrawEllipseElement
  | ExcalidrawTriangleElement
  | ExcalidrawParallelogramElement
  | ExcalidrawHexagonElement
  | ExcalidrawLineElement
  | ExcalidrawArrowElement
  | ExcalidrawFreedrawElement
  | ExcalidrawTextElement
  | ExcalidrawImageElement
  | ExcalidrawFrameElement

export type ExcalidrawAppStateSnapshot = Record<string, unknown>

export interface ExcalidrawBinaryFile {
  id: string
  mimeType: string
  dataURL: string
  created: number
}

export type ExcalidrawFiles = Readonly<Record<string, ExcalidrawBinaryFile>>

export interface ExcalidrawData {
  type: "excalidraw"
  version: 2
  source: string
  elements: readonly ExcalidrawElement[]
  appState?: ExcalidrawAppStateSnapshot
  files?: ExcalidrawFiles
}
