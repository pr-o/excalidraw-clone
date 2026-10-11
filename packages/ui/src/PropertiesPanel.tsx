import type {
  AlignEdge,
  Arrowhead,
  DistributeAxis,
  ExcalidrawElement,
  ExcalidrawTextElement,
  FillStyle,
  FontFamily,
  Roughness,
  Roundness,
  StrokeStyle,
  StrokeWidth,
  TextAlign,
} from "@excalidraw-clone/scene"

const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"] as const
const BG_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"] as const
const STROKE_WIDTHS: readonly StrokeWidth[] = [1, 2, 4]
const STROKE_STYLES: readonly StrokeStyle[] = ["solid", "dashed", "dotted"]
const FILL_STYLES: readonly FillStyle[] = ["hachure", "cross-hatch", "solid"]
const ROUGHNESS_LEVELS: readonly Roughness[] = [0, 1, 2]
const OPACITY_STEPS = [25, 50, 75, 100] as const
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
const ALIGN_GLYPH: Record<AlignEdge, string> = {
  left: "⇤",
  centerX: "↔",
  right: "⇥",
  top: "⤒",
  centerY: "↕",
  bottom: "⤓",
}

export interface PropertiesPanelProps {
  t: (key: string) => string
  selectedElements: readonly ExcalidrawElement[]
  /** Bound labels of the selected containers (labels are not selectable). */
  labelElements?: readonly ExcalidrawTextElement[]
  onChange: (patch: Partial<ExcalidrawElement>) => void
  onDelete: () => void
  onDuplicate: () => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: DistributeAxis) => void
  onGroup: () => void
  onUngroup: () => void
  onLock: () => void
  onFlip: (axis: "x" | "y") => void
  className?: string
}

function commonValue<T>(items: readonly object[], key: string): T | undefined {
  if (items.length === 0) return undefined
  const get = (item: object): unknown => (item as Record<string, unknown>)[key]
  const first = get(items[0] as object)
  return items.every((item) => get(item) === first) ? (first as T) : undefined
}

const CHECKER =
  "linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%), linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%)"
const ACTION = "flex-1 rounded border border-panel p-1 text-xs"

function Choice({
  pressed,
  className = "h-8 flex-1 text-xs",
  ...rest
}: { pressed: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`rounded border ${className} ${pressed ? "border-accent bg-accent-soft" : "border-panel"}`}
      {...rest}
    />
  )
}

export function PropertiesPanel({
  t,
  selectedElements,
  labelElements = [],
  onChange,
  onDelete,
  onDuplicate,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onLock,
  onFlip,
  className,
}: PropertiesPanelProps): React.ReactElement | null {
  if (selectedElements.length === 0) return null

  const common = <T,>(key: string): T | undefined => commonValue<T>(selectedElements, key)
  const strokeColor = common<string>("strokeColor")
  const backgroundColor = common<string>("backgroundColor")
  const strokeWidth = common<StrokeWidth>("strokeWidth")
  const roundness = common<Roundness>("roundness")
  const isRound = roundness !== undefined && roundness !== null
  const isSharp = roundness !== undefined && !isRound
  const allLinear = selectedElements.every((e) => e.type === "arrow" || e.type === "line")
  const allArrow = selectedElements.every((e) => e.type === "arrow")
  const labelled = new Set(labelElements.map((l) => l.containerId))
  // Text section: every selected element is text or carries a bound label.
  const allText = selectedElements.every((e) => e.type === "text" || labelled.has(e.id))
  const textElements = [
    ...selectedElements.flatMap((e) => (e.type === "text" ? [e] : [])),
    ...labelElements,
  ]
  // Arrow/line labels are zero-width and always centered.
  const canAlignText = !selectedElements.some((e) => e.type === "arrow" || e.type === "line")
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
  const canGroup = selectedElements.length >= 2
  const canUngroup = selectedElements.some((el) => el.groupIds.length > 0)

  /** A row of mutually exclusive buttons, each patching `field` with its value. */
  const row = <V,>(
    field: string,
    items: readonly (readonly [value: V, testId: string, label: React.ReactNode])[],
    group?: string,
    from: readonly object[] = selectedElements,
  ): React.ReactElement => {
    const current = commonValue<V>(from, field)
    return (
      <div
        className={`flex gap-1${group ? " mt-1" : ""}`}
        role={group ? "group" : undefined}
        aria-label={group}
      >
        {items.map(([value, testId, label]) => (
          <Choice
            key={testId}
            data-testid={testId}
            pressed={current === value}
            onClick={() => onChange({ [field]: value })}
          >
            {label}
          </Choice>
        ))}
      </div>
    )
  }

  const swatches = (
    colors: readonly string[],
    current: string | undefined,
    field: string,
    prefix: string,
  ): React.ReactElement => (
    <div className="flex gap-1">
      {colors.map((c) => (
        <Swatch
          key={c}
          color={c}
          active={current === c}
          testId={`${prefix}-${c === "transparent" ? "none" : c.replace("#", "")}`}
          onClick={() => onChange({ [field]: c })}
        />
      ))}
    </div>
  )

  return (
    <aside
      className={`flex max-h-[calc(100vh-1.5rem)] w-56 flex-col gap-3 overflow-y-auto rounded-lg bg-panel p-3 shadow ${className ?? ""}`}
      aria-label={t("properties.label")}
    >
      <Section label={t("properties.stroke")}>
        {swatches(STROKE_COLORS, strokeColor, "strokeColor", "stroke")}
      </Section>

      <Section label={t("properties.background")}>
        {swatches(BG_COLORS, backgroundColor, "backgroundColor", "bg")}
      </Section>

      <Section label={t("properties.strokeWidth")}>
        <div className="flex gap-1">
          {STROKE_WIDTHS.map((w) => (
            <Choice
              key={w}
              data-testid={`stroke-width-${w}`}
              pressed={strokeWidth === w}
              onClick={() => onChange({ strokeWidth: w })}
              className="h-8 w-8"
            >
              <div style={{ height: `${w}px` }} className="mx-auto w-5 bg-current" aria-hidden />
            </Choice>
          ))}
        </div>
      </Section>

      <Section label={t("properties.strokeStyle")}>
        {row(
          "strokeStyle",
          STROKE_STYLES.map((s) => [s, `stroke-style-${s}`, t(`properties.strokeStyle_${s}`)]),
        )}
      </Section>

      <Section label={t("properties.fillStyle")}>
        {row(
          "fillStyle",
          FILL_STYLES.map((s) => [s, `fill-style-${s}`, t(`properties.fillStyle_${s}`)]),
        )}
      </Section>

      <Section label={t("properties.roughness")}>
        {row(
          "roughness",
          ROUGHNESS_LEVELS.map((r) => [r, `roughness-${r}`, t(`properties.roughness_${r}`)]),
        )}
      </Section>

      {allLinear && (
        <Section label={t("properties.arrowheads")}>
          {(["start", "end"] as const).map((end) => {
            const field = `${end}Arrowhead`
            const value = common<Arrowhead | null>(field)
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
      )}

      {allArrow && (
        <Section label={t("properties.arrowType")}>
          {row("elbowed", [
            [false, "arrow-type-sharp", t("properties.arrowTypeSharp")],
            [true, "arrow-type-elbow", t("properties.arrowTypeElbow")],
          ])}
        </Section>
      )}

      {allText && (
        <Section label={t("properties.text")}>
          {row(
            "fontFamily",
            FONT_FAMILIES.map(([n, key]) => [
              n,
              `font-family-${n}`,
              t(`properties.fontFamily_${key}`),
            ]),
            t("properties.fontFamily"),
            textElements,
          )}
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
          {row(
            "fontSize",
            FONT_SIZES.map(([size, key]) => [
              size,
              `font-size-${size}`,
              t(`properties.fontSize_${key}`),
            ]),
            t("properties.fontSize"),
            textElements,
          )}
          {canAlignText &&
            row(
              "textAlign",
              TEXT_ALIGNS.map((a) => [a, `text-align-${a}`, t(`properties.textAlign_${a}`)]),
              t("properties.textAlign"),
              textElements,
            )}
        </Section>
      )}

      <Section label={t("properties.roundness")}>
        <div className="flex gap-1">
          <Choice
            data-testid="roundness-sharp"
            pressed={isSharp}
            onClick={() => onChange({ roundness: null })}
          >
            {t("properties.roundness_sharp")}
          </Choice>
          <Choice
            data-testid="roundness-round"
            pressed={isRound}
            onClick={() => onChange({ roundness: { type: 1 } })}
          >
            {t("properties.roundness_round")}
          </Choice>
        </div>
      </Section>

      <Section label={t("properties.opacity")}>
        {row(
          "opacity",
          OPACITY_STEPS.map((o) => [o, `opacity-${o}`, `${o}%`]),
        )}
      </Section>

      {(canGroup || canUngroup) && (
        <Section label={t("properties.group")}>
          <div className="flex gap-1">
            <button
              type="button"
              data-testid="group-selection"
              disabled={!canGroup}
              onClick={onGroup}
              className={`${ACTION} disabled:opacity-40`}
            >
              {t("properties.group")}
            </button>
            <button
              type="button"
              data-testid="ungroup-selection"
              disabled={!canUngroup}
              onClick={onUngroup}
              className={`${ACTION} disabled:opacity-40`}
            >
              {t("properties.ungroup")}
            </button>
          </div>
        </Section>
      )}

      {canGroup && (
        <Section label={t("properties.arrange")}>
          <div className="grid grid-cols-3 gap-1">
            {(["left", "centerX", "right", "top", "centerY", "bottom"] as const).map((edge) => (
              <button
                key={edge}
                type="button"
                data-testid={`align-${edge}`}
                aria-label={t(`properties.align_${edge}`)}
                onClick={() => onAlign(edge)}
                className={ACTION}
              >
                {ALIGN_GLYPH[edge]}
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {(["horizontal", "vertical"] as const).map((axis) => (
              <button
                key={axis}
                type="button"
                data-testid={`distribute-${axis}`}
                aria-label={t(`properties.distribute_${axis}`)}
                disabled={selectedElements.length < 3}
                onClick={() => onDistribute(axis)}
                className={`${ACTION} disabled:opacity-40`}
              >
                {axis === "horizontal" ? "⇿" : "⇳"}
              </button>
            ))}
          </div>
        </Section>
      )}

      {!selectedElements.every((el) => el.locked) && (
        <div className="flex gap-1">
          {(
            [
              ["x", "flip_horizontal", "⇋"],
              ["y", "flip_vertical", "⥯"],
            ] as const
          ).map(([axis, key, glyph]) => (
            <button
              key={axis}
              type="button"
              data-testid={`flip-${axis}`}
              aria-label={t(`properties.${key}`)}
              onClick={() => onFlip(axis)}
              className={ACTION}
            >
              {glyph}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        data-testid="panel-lock"
        onClick={onLock}
        className="w-full rounded border border-panel p-1 text-xs"
      >
        {t("properties.lock")}
      </button>

      <Section label={t("properties.actions")}>
        <div className="flex gap-2">
          <button type="button" onClick={onDuplicate} className={ACTION}>
            {t("properties.duplicate")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 rounded border border-danger p-1 text-xs text-danger hover:bg-danger-soft"
          >
            {t("properties.delete")}
          </button>
        </div>
      </Section>
    </aside>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">{label}</div>
      {children}
    </div>
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

function Swatch({
  color,
  active,
  testId,
  onClick,
}: {
  color: string
  active: boolean
  testId: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      aria-label={color}
      className={`h-7 w-7 rounded border-2 ${active ? "border-accent" : "border-panel"}`}
      style={{
        backgroundColor: color === "transparent" ? "white" : color,
        backgroundImage: color === "transparent" ? CHECKER : undefined,
        backgroundSize: color === "transparent" ? "8px 8px" : undefined,
        backgroundPosition: color === "transparent" ? "0 0, 4px 4px" : undefined,
      }}
    />
  )
}
