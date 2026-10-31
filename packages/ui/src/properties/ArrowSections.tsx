import type { Arrowhead, ExcalidrawElement } from "@excalidraw-clone/scene"
import { Choice, ChoiceRow, commonValue, type OnChange, Section, type T } from "./controls"

const ARROWHEAD_KINDS: readonly (Arrowhead | null)[] = [
  null,
  "arrow",
  "triangle",
  "triangle_outline",
  "bar",
  "dot",
  "circle",
  "circle_outline",
  "cross",
  "diamond",
  "diamond_outline",
]

interface SectionProps {
  t: T
  selectedElements: readonly ExcalidrawElement[]
  onChange: OnChange
}

/** Start/end arrowhead pickers; shown when every selected element is a line or arrow. */
export function ArrowheadsSection({
  t,
  selectedElements,
  onChange,
}: SectionProps): React.ReactElement {
  return (
    <Section label={t("properties.arrowheads")}>
      {(["start", "end"] as const).map((end) => {
        const field = `${end}Arrowhead`
        const value = commonValue<Arrowhead | null>(selectedElements, field)
        return (
          <div key={end} className="mb-1 flex items-center gap-1">
            <span className="w-8 text-[10px] text-muted">
              {t(`properties.arrowhead${end === "start" ? "Start" : "End"}`)}
            </span>
            <div className="flex flex-1 flex-wrap gap-0.5">
              {ARROWHEAD_KINDS.map((kind) => (
                <Choice
                  key={kind ?? "none"}
                  data-testid={`arrowhead-${end}-${kind ?? "none"}`}
                  pressed={value === kind}
                  aria-label={t(`properties.arrowhead_${kind ?? "none"}`)}
                  title={t(`properties.arrowhead_${kind ?? "none"}`)}
                  onClick={() => onChange({ [field]: kind })}
                  className="flex h-6 w-6 items-center justify-center"
                >
                  <ArrowheadGlyph kind={kind} />
                </Choice>
              ))}
            </div>
          </div>
        )
      })}
    </Section>
  )
}

/** Sharp vs elbow routing; shown when every selected element is an arrow. */
export function ArrowTypeSection({
  t,
  selectedElements,
  onChange,
}: SectionProps): React.ReactElement {
  return (
    <Section label={t("properties.arrowType")}>
      <ChoiceRow
        field="elbowed"
        items={[
          [false, "arrow-type-sharp", t("properties.arrowTypeSharp")],
          [true, "arrow-type-elbow", t("properties.arrowTypeElbow")],
        ]}
        from={selectedElements}
        onChange={onChange}
      />
    </Section>
  )
}

function ArrowheadGlyph({ kind }: { kind: Arrowhead | null }): React.ReactElement {
  const head = (() => {
    switch (kind) {
      case "arrow":
        return <path d="M9 4 L14 8 L9 12" fill="none" />
      case "triangle":
        return <path d="M14 8 L8 4.5 L8 11.5 Z" fill="currentColor" />
      case "triangle_outline":
        return <path d="M14 8 L8 4.5 L8 11.5 Z" fill="none" />
      case "bar":
        return <path d="M13 3.5 L13 12.5" fill="none" />
      case "dot":
        return <circle cx="12" cy="8" r="2" fill="currentColor" stroke="none" />
      case "circle":
        return <circle cx="11.5" cy="8" r="3.5" fill="currentColor" stroke="none" />
      case "circle_outline":
        return <circle cx="11.5" cy="8" r="3.5" fill="none" />
      case "cross":
        return <path d="M9.5 5 L14.5 11 M14.5 5 L9.5 11" fill="none" />
      case "diamond":
        return <path d="M14 8 L11 5 L8 8 L11 11 Z" fill="currentColor" />
      case "diamond_outline":
        return <path d="M14 8 L11 5 L8 8 L11 11 Z" fill="none" />
      default:
        return null
    }
  })()
  const shaftEnd = kind === null ? 14 : 9
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d={`M2 8 L${shaftEnd} 8`} fill="none" />
      {head}
    </svg>
  )
}
