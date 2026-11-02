import { measureText } from "@excalidraw-clone/renderer"
import type { ExcalidrawElement, ExcalidrawTextElement, Scene } from "@excalidraw-clone/scene"

/** The fields that determine a text element's rendered size. */
export type TextMeasureInput = Pick<
  ExcalidrawTextElement,
  "text" | "fontSize" | "fontFamily" | "lineHeight" | "fontWeight" | "fontStyle" | "spans"
> &
  Partial<Pick<ExcalidrawTextElement, "autoResize" | "width">>

export interface MeasuredSize {
  width: number
  height: number
}

/** Measure the rendered size of a free-standing (unbound) text element using
 *  a scratch canvas 2D context, so its persisted width/height — and so its
 *  hit-test box — fit its content. Returns undefined when no 2D context is
 *  available (e.g. bare jsdom); callers then leave the size unchanged.
 *  Fixed-width text (autoResize false) keeps its width and wraps to it.
 *  Bound labels must not be measured here — reconcileBoundText sizes those. */
export function measureStandaloneText(input: TextMeasureInput): MeasuredSize | undefined {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return undefined
  const wrapWidth = input.autoResize === false ? input.width : undefined
  const size = measureText(
    ctx,
    input.text,
    input.fontSize,
    input.fontFamily,
    input.lineHeight,
    input.fontWeight ?? "normal",
    input.fontStyle ?? "normal",
    wrapWidth,
    input.spans,
  )
  return wrapWidth === undefined ? size : { width: wrapWidth, height: size.height }
}

/** Post-mutation pass for tool gestures: a free text whose fixed width just
 *  changed gets its wrapped height re-measured, and one whose autoResize was
 *  just turned back on gets its natural size. Other text is left alone. */
export function reflowFixedWidthText(
  before: readonly ExcalidrawElement[],
  draft: ExcalidrawElement[],
  measure: (input: TextMeasureInput) => MeasuredSize | undefined = measureStandaloneText,
): void {
  const prev = new Map(before.map((e) => [e.id, e] as const))
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (e.type !== "text" || e.containerId !== null) continue
    const p = prev.get(e.id)
    if (!p || p === e || p.type !== "text") continue
    const unchanged =
      e.autoResize === false
        ? p.autoResize === false && p.width === e.width
        : p.autoResize !== false
    if (unchanged) continue
    const size = measure(e)
    if (size) draft[i] = { ...e, width: size.width, height: size.height }
  }
}

/** Re-fit auto-sized free text to the now-loaded web fonts. Sizes measured
 *  before Caveat loaded used a fallback font, so their hit boxes are off.
 *  Not an undo step: it corrects layout, it doesn't edit the drawing. */
export function refitFreeText(scene: Scene): void {
  const fits = new Map<string, MeasuredSize>()
  for (const e of scene.getElements()) {
    if (e.type !== "text" || e.containerId !== null || e.autoResize === false) continue
    const size = measureStandaloneText(e)
    if (size && (Math.abs(size.width - e.width) > 0.5 || Math.abs(size.height - e.height) > 0.5))
      fits.set(e.id, size)
  }
  if (fits.size === 0) return
  scene.mutate(
    (draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        const size = fits.get(draft[i]!.id)
        if (size) draft[i] = { ...draft[i]!, ...size }
      }
    },
    { skipHistory: true },
  )
}
