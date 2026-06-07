import type { StrokeStyle } from "@excalidraw-clone/scene"

/** rough.js `strokeLineDash` pattern for each stroke style. */
export const strokeLineDash = (style: StrokeStyle): number[] => {
  switch (style) {
    case "dashed":
      return [8, 8]
    case "dotted":
      return [2, 6]
    default:
      return []
  }
}
