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
import { LABELABLE_TYPES, rangeHasStyle, type SpanStyle } from "@excalidraw-clone/scene"

// Chromium-only; the button is simply absent elsewhere.
interface EyeDropperApi {
  open: () => Promise<{ sRGBHex: string }>
}
const eyeDropperCtor = (): (new () => EyeDropperApi) | undefined =>
  (globalThis as { EyeDropper?: new () => EyeDropperApi }).EyeDropper

const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"] as const
const BG_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"] as const
// Gradient end colours: the solid background palette.
const GRADIENT_COLORS: readonly string[] = BG_COLORS.slice(1)
// [degrees, glyph]: 0 = left→right, 90 = top→bottom.
const GRADIENT_ANGLES = [
  [0, "→"],
  [45, "↘"],
  [90, "↓"],
  [135, "↙"],
] as const
// Shadow presets (scene units). Colours are 8-digit hex so swatch test ids stay simple.
const SHADOW_SIZES = {
  soft: { blur: 12, offsetX: 4, offsetY: 4 },
  medium: { blur: 6, offsetX: 6, offsetY: 6 },
  hard: { blur: 0, offsetX: 8, offsetY: 8 },
} as const
const SHADOW_COLORS: readonly string[] = ["#00000059", "#00000099", "#868e9680"]
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

export type TableAction = "addRow" | "addCol" | "delRow" | "delCol"

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
  onTidy: () => void
  onGroup: () => void
  onUngroup: () => void
  onLock: () => void
  onFlip: (axis: "x" | "y") => void
  /** Apply/clear a bold|italic span over the whole text of the selected text elements and labels. */
  onSetTextStyle?: (style: SpanStyle, on: boolean) => void
  /** Structure edit for the single selected table (row/col of its active cell, else the last). */
  onTableAction?: (action: TableAction) => void
  /** Shown only for a single unlocked, cropped image. */
  onResetCrop?: () => void
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
  onTidy,
  onGroup,
  onUngroup,
  onLock,
  onFlip,
  onSetTextStyle,
  onTableAction,
  onResetCrop,
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
  const allText = selectedElements.every(
    (e) => e.type === "text" || e.type === "table" || labelled.has(e.id),
  )
  const textElements = [
    ...selectedElements.flatMap((e) => (e.type === "text" ? [e] : [])),
    ...labelElements,
  ]
  // Tables share fontFamily/fontSize/textAlign with text; bold/italic don't apply (header is bold).
  const tables = selectedElements.flatMap((e) => (e.type === "table" ? [e] : []))
  const fontTargets: readonly object[] = [...textElements, ...tables]
  const soleTable = selectedElements.length === 1 && tables.length === 1 ? tables[0]! : undefined
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
  const wholeStyled = (style: SpanStyle): boolean => {
    const filled = textElements.filter((e) => e.text.length > 0)
    return (
      filled.length > 0 &&
      filled.every((e) => rangeHasStyle(e.spans, e.text.length, 0, e.text.length, style))
    )
  }
  const spanBold = wholeStyled("bold")
  const spanItalic = wholeStyled("italic")
  // Gradient-capable shapes are the labelable closed shapes (see renderer gradientLine).
  const gradientTarget = selectedElements.find((e) => LABELABLE_TYPES.has(e.type))
  const gradient = gradientTarget?.gradient
  // Frames never cast a shadow (see scene elementShadow).
  const shadowTarget = selectedElements.find((e) => e.type !== "frame")
  const shadow = shadowTarget?.shadow
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
    pick: (color: string) => void,
    prefix: string,
  ): React.ReactElement => (
    <div className="flex gap-1">
      {colors.map((c) => (
        <Swatch
          key={c}
          color={c}
          active={current === c}
          testId={`${prefix}-${c === "transparent" ? "none" : c.replace("#", "")}`}
          onClick={() => pick(c)}
        />
      ))}
      {eyeDropperCtor() && (
        <button
          type="button"
          data-testid={`${prefix}-eyedropper`}
          aria-label={t("properties.eyedropper")}
          title={t("properties.eyedropper")}
          className="h-6 w-6 rounded border border-panel text-xs"
          onClick={() => {
            const Ctor = eyeDropperCtor()
            // Escape rejects the promise; nothing to apply.
            void new Ctor!()
              .open()
              .then(({ sRGBHex }) => pick(sRGBHex))
              .catch(() => {})
          }}
        >
          💧
        </button>
      )}
    </div>
  )

  return (
    <aside
      className={`flex max-h-[calc(100vh-1.5rem)] w-56 flex-col gap-3 overflow-y-auto rounded-lg bg-panel p-3 shadow ${className ?? ""}`}
      aria-label={t("properties.label")}
    >
      <Section label={t("properties.stroke")}>
        {swatches(STROKE_COLORS, strokeColor, (c) => onChange({ strokeColor: c }), "stroke")}
      </Section>

      <Section label={t("properties.background")}>
        {swatches(BG_COLORS, backgroundColor, (c) => onChange({ backgroundColor: c }), "bg")}
        {gradientTarget && (
          <Choice
            data-testid="gradient-toggle"
            pressed={gradient !== undefined}
            onClick={() =>
              onChange(
                gradient
                  ? { gradient: undefined }
                  : {
                      // Gradients render only over a solid fill.
                      fillStyle: "solid",
                      gradient: {
                        // Next palette colour after the fill (first one for custom fills).
                        to: GRADIENT_COLORS[
                          (GRADIENT_COLORS.indexOf(gradientTarget.backgroundColor) + 1) %
                            GRADIENT_COLORS.length
                        ]!,
                        angle: 90,
                      },
                    },
              )
            }
            className="mt-1 h-7 w-full text-xs"
          >
            {t("properties.gradient")}
          </Choice>
        )}
        {gradient && (
          <>
            <div className="mt-1">
              {swatches(
                GRADIENT_COLORS,
                gradient.to,
                (c) => onChange({ gradient: { ...gradient, to: c } }),
                "gradient-to",
              )}
            </div>
            <div
              className="mt-1 flex gap-1"
              role="group"
              aria-label={t("properties.gradientAngle")}
            >
              {GRADIENT_ANGLES.map(([angle, glyph]) => (
                <Choice
                  key={angle}
                  data-testid={`gradient-angle-${angle}`}
                  pressed={gradient.angle === angle}
                  aria-label={`${angle}°`}
                  onClick={() => onChange({ gradient: { ...gradient, angle } })}
                >
                  {glyph}
                </Choice>
              ))}
            </div>
          </>
        )}
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

      {shadowTarget && (
        <Section label={t("properties.shadow")}>
          <Choice
            data-testid="shadow-toggle"
            pressed={shadow !== undefined}
            onClick={() =>
              onChange({
                shadow: shadow ? undefined : { color: SHADOW_COLORS[0]!, ...SHADOW_SIZES.medium },
              })
            }
            className="h-7 w-full text-xs"
          >
            {t("properties.shadow")}
          </Choice>
          {shadow && (
            <>
              <div className="mt-1 flex gap-1" role="group" aria-label={t("properties.shadowSize")}>
                {(Object.keys(SHADOW_SIZES) as (keyof typeof SHADOW_SIZES)[]).map((size) => (
                  <Choice
                    key={size}
                    data-testid={`shadow-size-${size}`}
                    pressed={
                      shadow.blur === SHADOW_SIZES[size].blur &&
                      shadow.offsetX === SHADOW_SIZES[size].offsetX
                    }
                    onClick={() => onChange({ shadow: { ...shadow, ...SHADOW_SIZES[size] } })}
                  >
                    {t(`properties.shadow_${size}`)}
                  </Choice>
                ))}
              </div>
              <div className="mt-1">
                {swatches(
                  SHADOW_COLORS,
                  shadow.color,
                  (c) => onChange({ shadow: { ...shadow, color: c } }),
                  "shadow-color",
                )}
              </div>
            </>
          )}
        </Section>
      )}

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
            fontTargets,
          )}
          {tables.length === 0 && (
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
          {onSetTextStyle && tables.length === 0 && (
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
          {row(
            "fontSize",
            FONT_SIZES.map(([size, key]) => [
              size,
              `font-size-${size}`,
              t(`properties.fontSize_${key}`),
            ]),
            t("properties.fontSize"),
            fontTargets,
          )}
          {canAlignText &&
            row(
              "textAlign",
              TEXT_ALIGNS.map((a) => [a, `text-align-${a}`, t(`properties.textAlign_${a}`)]),
              t("properties.textAlign"),
              fontTargets,
            )}
        </Section>
      )}

      {soleTable && onTableAction && (
        <Section label={t("properties.table")}>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                ["addRow", "table-add-row", "properties.tableAddRow"],
                ["addCol", "table-add-col", "properties.tableAddCol"],
                ["delRow", "table-del-row", "properties.tableDelRow"],
                ["delCol", "table-del-col", "properties.tableDelCol"],
              ] as const
            ).map(([action, testId, key]) => (
              <button
                key={action}
                type="button"
                data-testid={testId}
                disabled={
                  (action === "delRow" && soleTable.rows <= 1) ||
                  (action === "delCol" && soleTable.cols <= 1) ||
                  (action === "addRow" && soleTable.rows >= 50) ||
                  (action === "addCol" && soleTable.cols >= 50)
                }
                onClick={() => onTableAction(action)}
                className={`${ACTION} disabled:opacity-40`}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <Choice
            data-testid="table-header-toggle"
            pressed={soleTable.headerRow}
            onClick={() => onChange({ headerRow: !soleTable.headerRow })}
            className="mt-1 h-7 w-full text-xs"
          >
            {t("properties.tableHeader")}
          </Choice>
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
            <button
              type="button"
              data-testid="tidy-up"
              aria-label={t("properties.tidy_up")}
              onClick={onTidy}
              className={ACTION}
            >
              ▦
            </button>
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

      {onResetCrop &&
        selectedElements.length === 1 &&
        selectedElements[0]?.type === "image" &&
        selectedElements[0].crop &&
        !selectedElements[0].locked && (
          <button type="button" data-testid="reset-crop" onClick={onResetCrop} className={ACTION}>
            {t("properties.reset_crop")}
          </button>
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
