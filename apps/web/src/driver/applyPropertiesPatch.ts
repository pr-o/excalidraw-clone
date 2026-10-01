import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import {
  type MeasuredSize,
  measureStandaloneText,
  type TextMeasureInput,
} from "./measureStandaloneText"

export type Measurer = (input: TextMeasureInput) => MeasuredSize | undefined

/** Patch keys that change a text element's rendered size without changing its text. */
const FONT_KEYS = ["fontSize", "fontFamily", "fontWeight", "fontStyle"] as const

/** What one selected element becomes when a PropertiesPanel patch is applied.
 *
 *  A free-standing (unbound) text element whose font changes is re-measured
 *  from the *patched* element, so its width/height — and so its hit-test box —
 *  track what is actually rendered. Bound labels are left to reconcileBoundText;
 *  every other element (and every non-font patch) is a plain merge. If
 *  measurement is unavailable the patch still applies and the size is kept. */
export function applyPropertiesPatch(
  el: ExcalidrawElement,
  patch: Partial<ExcalidrawElement>,
  measure: Measurer = measureStandaloneText,
): ExcalidrawElement {
  const merged = { ...el, ...patch } as ExcalidrawElement
  if (merged.type !== "text" || merged.containerId !== null) return merged
  if (!FONT_KEYS.some((key) => key in patch)) return merged
  const size = measure(merged)
  return size ? { ...merged, width: size.width, height: size.height } : merged
}
