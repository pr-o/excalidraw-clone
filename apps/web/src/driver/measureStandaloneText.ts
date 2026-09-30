import { measureText } from "@excalidraw-clone/renderer"
import type { ExcalidrawTextElement } from "@excalidraw-clone/scene"

/** The fields that determine a text element's rendered size. */
export type TextMeasureInput = Pick<
  ExcalidrawTextElement,
  "text" | "fontSize" | "fontFamily" | "lineHeight" | "fontWeight" | "fontStyle"
>

export interface MeasuredSize {
  width: number
  height: number
}

/** Measure the rendered size of a free-standing (unbound) text element using
 *  a scratch canvas 2D context, so its persisted width/height — and so its
 *  hit-test box — fit its content. Returns undefined when no 2D context is
 *  available (e.g. bare jsdom); callers then leave the size unchanged.
 *  Bound labels must not be measured here — reconcileBoundText sizes those. */
export function measureStandaloneText(input: TextMeasureInput): MeasuredSize | undefined {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return undefined
  return measureText(
    ctx,
    input.text,
    input.fontSize,
    input.fontFamily,
    input.lineHeight,
    input.fontWeight ?? "normal",
    input.fontStyle ?? "normal",
  )
}
