import {
  labelInnerBox,
  polylineMidpoint,
  type LabelShapeKind,
  type Point,
} from "@excalidraw-clone/geometry"
import { nanoid } from "nanoid"
import type {
  ExcalidrawArrowElement,
  ExcalidrawDiamondElement,
  ExcalidrawElementBase,
  ExcalidrawEllipseElement,
  ExcalidrawFrameElement,
  ExcalidrawFreedrawElement,
  ExcalidrawHexagonElement,
  ExcalidrawImageElement,
  ExcalidrawLineElement,
  ExcalidrawParallelogramElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
  ExcalidrawTriangleElement,
  FontFamily,
  TextAlign,
  VerticalAlign,
} from "./types"
import {
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

import { NOTE_PADDING } from "./reconcile-bound-text"

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31)

export interface NewElementInput {
  x: number
  y: number
  width?: number
  height?: number
  angle?: number
  strokeColor?: string
  backgroundColor?: string
}

const baseElement = (input: NewElementInput): Omit<ExcalidrawElementBase, "type"> => ({
  id: nanoid(),
  x: input.x,
  y: input.y,
  width: input.width ?? 0,
  height: input.height ?? 0,
  angle: input.angle ?? 0,
  strokeColor: input.strokeColor ?? DEFAULT_STROKE_COLOR,
  backgroundColor: input.backgroundColor ?? DEFAULT_BG_COLOR,
  fillStyle: DEFAULT_FILL_STYLE,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  strokeStyle: DEFAULT_STROKE_STYLE,
  roughness: DEFAULT_ROUGHNESS,
  opacity: DEFAULT_OPACITY,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: newSeed(),
  versionNonce: newSeed(),
  isDeleted: false,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
})

export const newRectangle = (input: NewElementInput): ExcalidrawRectangleElement => ({
  ...baseElement(input),
  type: "rectangle",
})

export const newDiamond = (input: NewElementInput): ExcalidrawDiamondElement => ({
  ...baseElement(input),
  type: "diamond",
})

export const newEllipse = (input: NewElementInput): ExcalidrawEllipseElement => ({
  ...baseElement(input),
  type: "ellipse",
})

export const newTriangle = (input: NewElementInput): ExcalidrawTriangleElement => ({
  ...baseElement(input),
  type: "triangle",
})

export const newParallelogram = (input: NewElementInput): ExcalidrawParallelogramElement => ({
  ...baseElement(input),
  type: "parallelogram",
})

export const newHexagon = (input: NewElementInput): ExcalidrawHexagonElement => ({
  ...baseElement(input),
  type: "hexagon",
})

export const newLine = (input: NewElementInput): ExcalidrawLineElement => ({
  ...baseElement(input),
  type: "line",
  points: [],
  lastCommittedPoint: null,
  startBinding: null,
  endBinding: null,
  startArrowhead: null,
  endArrowhead: null,
})

export interface NewArrowInput extends NewElementInput {
  elbowed?: boolean
}

export const newArrow = (input: NewArrowInput): ExcalidrawArrowElement => ({
  ...baseElement(input),
  type: "arrow",
  points: [],
  lastCommittedPoint: null,
  startBinding: null,
  endBinding: null,
  startArrowhead: null,
  endArrowhead: "arrow",
  elbowed: input.elbowed ?? false,
})

export const newFreedraw = (input: NewElementInput): ExcalidrawFreedrawElement => ({
  ...baseElement(input),
  type: "freedraw",
  points: [],
  pressures: [],
  simulatePressure: true,
  lastCommittedPoint: null,
})

export interface NewTextInput extends NewElementInput {
  text?: string
  fontSize?: number
  fontFamily?: FontFamily
  textAlign?: TextAlign
  verticalAlign?: VerticalAlign
  containerId?: string | null
}

export const newText = (input: NewTextInput): ExcalidrawTextElement => {
  const text = input.text ?? ""
  return {
    ...baseElement(input),
    type: "text",
    text,
    fontSize: input.fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily: input.fontFamily ?? DEFAULT_FONT_FAMILY,
    textAlign: input.textAlign ?? "left",
    verticalAlign: input.verticalAlign ?? "top",
    containerId: input.containerId ?? null,
    originalText: text,
    autoResize: true,
    lineHeight: DEFAULT_LINE_HEIGHT,
    baseline: 0,
  }
}

export interface NewImageInput extends NewElementInput {
  fileId?: string | null
}

export const newImage = (input: NewImageInput): ExcalidrawImageElement => ({
  ...baseElement(input),
  type: "image",
  fileId: input.fileId ?? null,
  status: "pending",
  scale: [1, 1],
  crop: null,
})

export interface NewFrameInput extends NewElementInput {
  name?: string | null
}

export const newFrame = (input: NewFrameInput): ExcalidrawFrameElement => ({
  ...baseElement(input),
  type: "frame",
  name: input.name ?? null,
  isCollapsed: false,
})

export interface NewNoteInput {
  x: number
  y: number
  width?: number
  height?: number
}

export const NOTE_BG_COLOR = "#ffec99"

export const newNote = (
  input: NewNoteInput,
): { container: ExcalidrawRectangleElement; text: ExcalidrawTextElement } => {
  const w = input.width ?? 0
  const h = input.height ?? 0
  const text = newText({
    x: input.x + NOTE_PADDING,
    y: input.y + NOTE_PADDING,
    width: Math.max(0, w - 2 * NOTE_PADDING),
    height: Math.max(0, h - 2 * NOTE_PADDING),
    text: "",
    textAlign: "center",
    verticalAlign: "middle",
  })
  const container: ExcalidrawRectangleElement = {
    ...newRectangle({
      x: input.x,
      y: input.y,
      width: w,
      height: h,
      backgroundColor: NOTE_BG_COLOR,
    }),
    roundness: { type: 1 },
    boundElements: [{ id: text.id, type: "text" }],
  }
  return { container, text: { ...text, containerId: container.id } }
}

/** Empty centered label text bound to `container`, sized to the shape-aware
 *  inner box. Caller must add `{ id, type: "text" }` to the container's
 *  boundElements. `container.type` must be in LABELABLE_TYPES. */
export const newLabelFor = (container: {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
}): ExcalidrawTextElement => {
  const box = labelInnerBox(container.type as LabelShapeKind, container, NOTE_PADDING)
  return newText({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    text: "",
    textAlign: "center",
    verticalAlign: "middle",
    containerId: container.id,
  })
}

/** Empty centered label text bound to a linear `container` (arrow/line),
 *  its zero-width box centered on the midpoint of the container's path.
 *  Caller must add `{ id, type: "text" }` to the container's boundElements. */
export const newLabelForLinear = (container: {
  id: string
  x: number
  y: number
  points: readonly Point[]
}): ExcalidrawTextElement => {
  const mid = polylineMidpoint(container.points)
  const height = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT
  return newText({
    x: container.x + mid.x,
    y: container.y + mid.y - height / 2,
    width: 0,
    height,
    text: "",
    textAlign: "center",
    verticalAlign: "middle",
    containerId: container.id,
  })
}
