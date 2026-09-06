import type {
  ExcalidrawElement,
  ExcalidrawElementBase,
  ExcalidrawLinearBase,
  ExcalidrawTextElement,
} from "@excalidraw-clone/scene"

/** Style fields every element type carries. */
export type BaseStyle = Pick<
  ExcalidrawElementBase,
  | "strokeColor"
  | "backgroundColor"
  | "fillStyle"
  | "strokeWidth"
  | "strokeStyle"
  | "roughness"
  | "opacity"
  | "roundness"
>

/** Extra style fields carried only by text elements. */
export type TextStyle = Pick<
  ExcalidrawTextElement,
  "fontFamily" | "fontSize" | "textAlign" | "verticalAlign"
>

/** Extra style fields carried only by arrows and lines. */
export type LinearStyle = Pick<ExcalidrawLinearBase, "startArrowhead" | "endArrowhead">

/**
 * A captured element style. `text`/`linear` are present only when the source
 * element carried them, and are applied only to targets of a matching kind.
 */
export interface StyleClipboard {
  base: BaseStyle
  text?: TextStyle
  linear?: LinearStyle
}

export function extractStyle(element: ExcalidrawElement): StyleClipboard {
  const clip: StyleClipboard = {
    base: {
      strokeColor: element.strokeColor,
      backgroundColor: element.backgroundColor,
      fillStyle: element.fillStyle,
      strokeWidth: element.strokeWidth,
      strokeStyle: element.strokeStyle,
      roughness: element.roughness,
      opacity: element.opacity,
      roundness: element.roundness,
    },
  }
  if (element.type === "text") {
    clip.text = {
      fontFamily: element.fontFamily,
      fontSize: element.fontSize,
      textAlign: element.textAlign,
      verticalAlign: element.verticalAlign,
    }
  }
  if (element.type === "arrow" || element.type === "line") {
    clip.linear = {
      startArrowhead: element.startArrowhead,
      endArrowhead: element.endArrowhead,
    }
  }
  return clip
}

/**
 * Returns a copy of `element` restyled from `clip`. Geometry, text content and
 * identity are untouched; type-specific groups are skipped when the target
 * can't carry them (e.g. a text style pasted onto a rectangle).
 */
export function applyStyle(element: ExcalidrawElement, clip: StyleClipboard): ExcalidrawElement {
  const next = { ...element, ...clip.base }
  if (clip.text && next.type === "text") return { ...next, ...clip.text }
  if (clip.linear && (next.type === "arrow" || next.type === "line")) {
    return { ...next, ...clip.linear }
  }
  return next
}
