import {
  isLinearElement,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
  type FontFamily,
  rangeHasStyle,
  type SpanStyle,
  type TextAlign,
} from "@excalidraw-clone/scene"
import { Choice, ChoiceRow, commonValue, type OnChange, Section, type T } from "./controls"

const FONT_FAMILIES: readonly (readonly [FontFamily, string])[] = [
  [1, "handDrawn"],
  [2, "normal"],
  [3, "code"],
]
// Preset font sizes: [px, i18n label suffix]. 20 matches DEFAULT_FONT_SIZE ("M").
const FONT_SIZES: readonly (readonly [number, string])[] = [
  [16, "s"],
  [20, "m"],
  [28, "l"],
  [36, "xl"],
]
const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right"]

/** Font, weight/style and alignment; shown when every selected element is text,
 *  a table, or carries a bound label. */
export function TextSection({
  t,
  selectedElements,
  labelElements,
  onChange,
  onSetTextStyle,
}: {
  t: T
  selectedElements: readonly ExcalidrawElement[]
  labelElements: readonly ExcalidrawTextElement[]
  onChange: OnChange
  onSetTextStyle: ((style: SpanStyle, on: boolean) => void) | undefined
}): React.ReactElement | null {
  const labelled = new Set(labelElements.map((l) => l.containerId))
  const allText = selectedElements.every(
    (e) => e.type === "text" || e.type === "table" || labelled.has(e.id),
  )
  if (!allText) return null

  const textElements = [
    ...selectedElements.flatMap((e) => (e.type === "text" ? [e] : [])),
    ...labelElements,
  ]
  // Tables share fontFamily/fontSize/textAlign with text; bold/italic don't apply (header is bold).
  const hasTables = selectedElements.some((e) => e.type === "table")
  const fontTargets: readonly ExcalidrawElement[] = [
    ...textElements,
    ...selectedElements.filter((e) => e.type === "table"),
  ]
  // Arrow/line labels are zero-width and always centered.
  const canAlignText = !selectedElements.some(isLinearElement)
  // Legacy elements may lack fontWeight/fontStyle; absent ⟺ "normal".
  const isBold =
    commonValue(
      textElements.map((e) => ({ fontWeight: e.fontWeight ?? "normal" })),
      "fontWeight",
    ) === "bold"
  const isItalic =
    commonValue(
      textElements.map((e) => ({ fontStyle: e.fontStyle ?? "normal" })),
      "fontStyle",
    ) === "italic"
  const wholeStyled = (style: SpanStyle): boolean => {
    const filled = textElements.filter((e) => e.text.length > 0)
    return (
      filled.length > 0 &&
      filled.every((e) => rangeHasStyle(e.spans, e.text.length, 0, e.text.length, style))
    )
  }
  const spanBold = wholeStyled("bold")
  const spanItalic = wholeStyled("italic")

  return (
    <Section id="text" label={t("properties.text")} className="border-t border-panel-subtle pt-3">
      <ChoiceRow
        field="fontFamily"
        items={FONT_FAMILIES.map(([n, key]) => [
          n,
          `font-family-${n}`,
          t(`properties.fontFamily_${key}`),
        ])}
        group={t("properties.fontFamily")}
        from={fontTargets}
        onChange={onChange}
      />
      {!hasTables && (
        <div className="mt-1 flex gap-1">
          <Choice
            data-testid="font-bold"
            pressed={isBold}
            onClick={() => onChange({ fontWeight: isBold ? "normal" : "bold" })}
            className="h-8 flex-1 text-xs font-bold"
          >
            {t("properties.bold")}
          </Choice>
          <Choice
            data-testid="font-italic"
            pressed={isItalic}
            onClick={() => onChange({ fontStyle: isItalic ? "normal" : "italic" })}
            className="h-8 flex-1 text-xs italic"
          >
            {t("properties.italic")}
          </Choice>
        </div>
      )}
      {onSetTextStyle && !hasTables && (
        <div className="mt-1 flex gap-1" role="group" aria-label={t("properties.textStyle")}>
          <Choice
            data-testid="text-bold"
            pressed={spanBold}
            onClick={() => onSetTextStyle("bold", !spanBold)}
            className="h-8 flex-1 text-xs font-bold"
          >
            {t("properties.spanBold")}
          </Choice>
          <Choice
            data-testid="text-italic"
            pressed={spanItalic}
            onClick={() => onSetTextStyle("italic", !spanItalic)}
            className="h-8 flex-1 text-xs italic"
          >
            {t("properties.spanItalic")}
          </Choice>
        </div>
      )}
      <ChoiceRow
        field="fontSize"
        items={FONT_SIZES.map(([size, key]) => [
          size,
          `font-size-${size}`,
          t(`properties.fontSize_${key}`),
        ])}
        group={t("properties.fontSize")}
        from={fontTargets}
        onChange={onChange}
      />
      {canAlignText && (
        <ChoiceRow
          field="textAlign"
          items={TEXT_ALIGNS.map((a) => [a, `text-align-${a}`, t(`properties.textAlign_${a}`)])}
          group={t("properties.textAlign")}
          from={fontTargets}
          onChange={onChange}
        />
      )}
    </Section>
  )
}
