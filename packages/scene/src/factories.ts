import { nanoid } from "nanoid"
import type {
  ExcalidrawArrowElement,
  ExcalidrawDiamondElement,
  ExcalidrawElementBase,
  ExcalidrawEllipseElement,
  ExcalidrawFrameElement,
  ExcalidrawFreedrawElement,
  ExcalidrawImageElement,
  ExcalidrawLineElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
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

export const newArrow = (input: NewElementInput): ExcalidrawArrowElement => ({
  ...baseElement(input),
  type: "arrow",
  points: [],
  lastCommittedPoint: null,
  startBinding: null,
  endBinding: null,
  startArrowhead: null,
  endArrowhead: "arrow",
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
