import type {
  AlignEdge,
  Arrowhead,
  DistributeAxis,
  ExcalidrawElement,
  FillStyle,
  Roundness,
  StrokeStyle,
  StrokeWidth,
} from "@excalidraw-clone/scene"

const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"] as const
const BG_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"] as const
const STROKE_WIDTHS: readonly StrokeWidth[] = [1, 2, 4]
const STROKE_STYLES: readonly StrokeStyle[] = ["solid", "dashed", "dotted"]
const FILL_STYLES: readonly FillStyle[] = ["hachure", "cross-hatch", "solid"]
const OPACITY_STEPS = [25, 50, 75, 100] as const
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
  onChange: (patch: Partial<ExcalidrawElement>) => void
  onDelete: () => void
  onDuplicate: () => void
  onSendToBack: () => void
  onSendBackward: () => void
  onBringForward: () => void
  onBringToFront: () => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: DistributeAxis) => void
  onGroup: () => void
  onUngroup: () => void
  onLock: () => void
  className?: string
}

function commonValue<T>(items: readonly { [k: string]: unknown }[], key: string): T | undefined {
  if (items.length === 0) return undefined
  const first = items[0]?.[key] as T
  for (let i = 1; i < items.length; i += 1) {
    if (items[i]?.[key] !== first) return undefined
  }
  return first
}

export function PropertiesPanel({
  t,
  selectedElements,
  onChange,
  onDelete,
  onDuplicate,
  onSendToBack,
  onSendBackward,
  onBringForward,
  onBringToFront,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onLock,
  className,
}: PropertiesPanelProps): React.ReactElement | null {
  if (selectedElements.length === 0) return null

  const strokeColor = commonValue<string>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "strokeColor",
  )
  const backgroundColor = commonValue<string>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "backgroundColor",
  )
  const strokeWidth = commonValue<StrokeWidth>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "strokeWidth",
  )
  const opacity = commonValue<number>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "opacity",
  )
  const strokeStyle = commonValue<StrokeStyle>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "strokeStyle",
  )
  const fillStyle = commonValue<FillStyle>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "fillStyle",
  )
  const roundness = commonValue<Roundness>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "roundness",
  )
  const isRound = roundness !== undefined && roundness !== null
  const allLinear =
    selectedElements.length > 0 &&
    selectedElements.every((e) => e.type === "arrow" || e.type === "line")
  const startArrowhead = commonValue<Arrowhead | null>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "startArrowhead",
  )
  const endArrowhead = commonValue<Arrowhead | null>(
    selectedElements as unknown as readonly { [k: string]: unknown }[],
    "endArrowhead",
  )

  return (
    <aside
      className={`flex w-56 flex-col gap-3 rounded-lg bg-white p-3 shadow ${className ?? ""}`}
      aria-label={t("properties.label")}
    >
      <Section label={t("properties.stroke")}>
        <div className="flex gap-1">
          {STROKE_COLORS.map((c) => (
            <Swatch
              key={c}
              color={c}
              active={strokeColor === c}
              testId={`stroke-${c.replace("#", "")}`}
              onClick={() => onChange({ strokeColor: c })}
            />
          ))}
        </div>
      </Section>

      <Section label={t("properties.background")}>
        <div className="flex gap-1">
          {BG_COLORS.map((c) => (
            <Swatch
              key={c}
              color={c}
              active={backgroundColor === c}
              testId={`bg-${c === "transparent" ? "none" : c.replace("#", "")}`}
              onClick={() => onChange({ backgroundColor: c })}
            />
          ))}
        </div>
      </Section>

      <Section label={t("properties.strokeWidth")}>
        <div className="flex gap-1">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              data-testid={`stroke-width-${w}`}
              aria-pressed={strokeWidth === w}
              onClick={() => onChange({ strokeWidth: w })}
              className={`h-8 w-8 rounded border ${strokeWidth === w ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
            >
              <div style={{ height: `${w}px` }} className="mx-auto w-5 bg-current" aria-hidden />
            </button>
          ))}
        </div>
      </Section>

      <Section label={t("properties.strokeStyle")}>
        <div className="flex gap-1">
          {STROKE_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`stroke-style-${s}`}
              aria-pressed={strokeStyle === s}
              onClick={() => onChange({ strokeStyle: s })}
              className={`h-8 flex-1 rounded border text-xs ${strokeStyle === s ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
            >
              {t(`properties.strokeStyle_${s}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section label={t("properties.fillStyle")}>
        <div className="flex gap-1">
          {FILL_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`fill-style-${s}`}
              aria-pressed={fillStyle === s}
              onClick={() => onChange({ fillStyle: s })}
              className={`h-8 flex-1 rounded border text-xs ${fillStyle === s ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
            >
              {t(`properties.fillStyle_${s}`)}
            </button>
          ))}
        </div>
      </Section>

      {allLinear && (
        <Section label={t("properties.arrowheads")}>
          {(
            [
              ["start", "startArrowhead", startArrowhead],
              ["end", "endArrowhead", endArrowhead],
            ] as const
          ).map(([end, field, value]) => (
            <div key={end} className="mb-1 flex items-center gap-1">
              <span className="w-8 text-[10px] text-gray-500">
                {t(`properties.arrowhead${end === "start" ? "Start" : "End"}`)}
              </span>
              <div className="flex flex-1 flex-wrap gap-0.5">
                {ARROWHEAD_KINDS.map((kind) => (
                  <button
                    key={kind ?? "none"}
                    type="button"
                    data-testid={`arrowhead-${end}-${kind ?? "none"}`}
                    aria-pressed={value === kind}
                    aria-label={t(`properties.arrowhead_${kind ?? "none"}`)}
                    title={t(`properties.arrowhead_${kind ?? "none"}`)}
                    onClick={() => onChange({ [field]: kind })}
                    className={`flex h-6 w-6 items-center justify-center rounded border ${value === kind ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
                  >
                    <ArrowheadGlyph kind={kind} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section label={t("properties.roundness")}>
        <div className="flex gap-1">
          <button
            type="button"
            data-testid="roundness-sharp"
            aria-pressed={roundness !== undefined && !isRound}
            onClick={() => onChange({ roundness: null })}
            className={`h-8 flex-1 rounded border text-xs ${roundness !== undefined && !isRound ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
          >
            {t("properties.roundness_sharp")}
          </button>
          <button
            type="button"
            data-testid="roundness-round"
            aria-pressed={isRound}
            onClick={() => onChange({ roundness: { type: 1 } })}
            className={`h-8 flex-1 rounded border text-xs ${isRound ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
          >
            {t("properties.roundness_round")}
          </button>
        </div>
      </Section>

      <Section label={t("properties.opacity")}>
        <div className="flex gap-1">
          {OPACITY_STEPS.map((o) => (
            <button
              key={o}
              type="button"
              data-testid={`opacity-${o}`}
              aria-pressed={opacity === o}
              onClick={() => onChange({ opacity: o })}
              className={`h-8 flex-1 rounded border text-xs ${opacity === o ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
            >
              {o}%
            </button>
          ))}
        </div>
      </Section>

      {(selectedElements.length >= 2 || selectedElements.some((el) => el.groupIds.length > 0)) && (
        <Section label={t("properties.group")}>
          <div className="flex gap-1">
            <button
              type="button"
              data-testid="group-selection"
              disabled={selectedElements.length < 2}
              onClick={onGroup}
              className="flex-1 rounded border border-gray-300 p-1 text-xs disabled:opacity-40"
            >
              {t("properties.group")}
            </button>
            <button
              type="button"
              data-testid="ungroup-selection"
              disabled={!selectedElements.some((el) => el.groupIds.length > 0)}
              onClick={onUngroup}
              className="flex-1 rounded border border-gray-300 p-1 text-xs disabled:opacity-40"
            >
              {t("properties.ungroup")}
            </button>
          </div>
        </Section>
      )}

      {selectedElements.length >= 2 && (
        <Section label={t("properties.arrange")}>
          <div className="grid grid-cols-3 gap-1">
            {(["left", "centerX", "right", "top", "centerY", "bottom"] as const).map((edge) => (
              <button
                key={edge}
                type="button"
                data-testid={`align-${edge}`}
                aria-label={t(`properties.align_${edge}`)}
                onClick={() => onAlign(edge)}
                className="rounded border border-gray-300 p-1 text-xs"
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
                className="flex-1 rounded border border-gray-300 p-1 text-xs disabled:opacity-40"
              >
                {axis === "horizontal" ? "⇿" : "⇳"}
              </button>
            ))}
          </div>
        </Section>
      )}

      <button
        type="button"
        data-testid="panel-lock"
        onClick={onLock}
        className="w-full rounded border border-gray-300 p-1 text-xs"
      >
        {t("properties.lock")}
      </button>

      <Section label={t("properties.layers")}>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={onSendToBack}
            className="rounded border border-gray-300 p-1 text-xs"
          >
            {t("properties.sendToBack")}
          </button>
          <button
            type="button"
            onClick={onSendBackward}
            className="rounded border border-gray-300 p-1 text-xs"
          >
            {t("properties.sendBackward")}
          </button>
          <button
            type="button"
            onClick={onBringForward}
            className="rounded border border-gray-300 p-1 text-xs"
          >
            {t("properties.bringForward")}
          </button>
          <button
            type="button"
            onClick={onBringToFront}
            className="rounded border border-gray-300 p-1 text-xs"
          >
            {t("properties.bringToFront")}
          </button>
        </div>
      </Section>

      <Section label={t("properties.actions")}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDuplicate}
            className="flex-1 rounded border border-gray-300 p-1 text-xs"
          >
            {t("properties.duplicate")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 rounded border border-red-300 p-1 text-xs text-red-600 hover:bg-red-50"
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
      <div className="mb-1 text-xs font-medium text-gray-600">{label}</div>
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
      className={`h-7 w-7 rounded border-2 ${active ? "border-violet-600" : "border-gray-300"}`}
      style={{
        backgroundColor: color === "transparent" ? "white" : color,
        backgroundImage:
          color === "transparent"
            ? "linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%), linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%)"
            : undefined,
        backgroundSize: color === "transparent" ? "8px 8px" : undefined,
        backgroundPosition: color === "transparent" ? "0 0, 4px 4px" : undefined,
      }}
    />
  )
}
