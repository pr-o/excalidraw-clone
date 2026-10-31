import type {
  AlignEdge,
  DistributeAxis,
  ExcalidrawElement,
  ExcalidrawTextElement,
  FillStyle,
  Roughness,
  Roundness,
  SpanStyle,
  StrokeStyle,
  StrokeWidth,
} from "@excalidraw-clone/scene"
import { ArrangeSection, FlipRow, GroupSection } from "./properties/ArrangeSections"
import { ArrowheadsSection, ArrowTypeSection } from "./properties/ArrowSections"
import { BackgroundSection } from "./properties/BackgroundSection"
import { ACTION, Choice, ChoiceRow, commonValue, Section, Swatches } from "./properties/controls"
import { ShadowSection } from "./properties/ShadowSection"
import { type TableAction, TableSection } from "./properties/TableSection"
import { TextSection } from "./properties/TextSection"

export type { TableAction }

const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"] as const
const STROKE_WIDTHS: readonly StrokeWidth[] = [1, 2, 4]
const STROKE_STYLES: readonly StrokeStyle[] = ["solid", "dashed", "dotted"]
const FILL_STYLES: readonly FillStyle[] = ["hachure", "cross-hatch", "solid"]
const ROUGHNESS_LEVELS: readonly Roughness[] = [0, 1, 2]
const OPACITY_STEPS = [25, 50, 75, 100] as const

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

  const common = <V,>(key: string): V | undefined => commonValue<V>(selectedElements, key)
  const strokeWidth = common<StrokeWidth>("strokeWidth")
  const roundness = common<Roundness>("roundness")
  const isRound = roundness !== undefined && roundness !== null
  const isSharp = roundness !== undefined && !isRound
  const allLinear = selectedElements.every((e) => e.type === "arrow" || e.type === "line")
  const allArrow = selectedElements.every((e) => e.type === "arrow")
  const sole = selectedElements.length === 1 ? selectedElements[0] : undefined
  const soleTable = sole?.type === "table" ? sole : undefined
  const canGroup = selectedElements.length >= 2
  const canUngroup = selectedElements.some((el) => el.groupIds.length > 0)
  const rowProps = { from: selectedElements, onChange }

  return (
    <aside
      className={`flex max-h-[calc(100vh-1.5rem)] w-56 flex-col gap-3 overflow-y-auto rounded-lg bg-panel p-3 shadow ${className ?? ""}`}
      aria-label={t("properties.label")}
    >
      <Section label={t("properties.stroke")}>
        <Swatches
          t={t}
          colors={STROKE_COLORS}
          current={common<string>("strokeColor")}
          pick={(c) => onChange({ strokeColor: c })}
          prefix="stroke"
        />
      </Section>

      <BackgroundSection
        t={t}
        selectedElements={selectedElements}
        backgroundColor={common<string>("backgroundColor")}
        onChange={onChange}
      />

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
        <ChoiceRow
          field="strokeStyle"
          items={STROKE_STYLES.map((s) => [
            s,
            `stroke-style-${s}`,
            t(`properties.strokeStyle_${s}`),
          ])}
          {...rowProps}
        />
      </Section>

      <Section label={t("properties.fillStyle")}>
        <ChoiceRow
          field="fillStyle"
          items={FILL_STYLES.map((s) => [s, `fill-style-${s}`, t(`properties.fillStyle_${s}`)])}
          {...rowProps}
        />
      </Section>

      <Section label={t("properties.roughness")}>
        <ChoiceRow
          field="roughness"
          items={ROUGHNESS_LEVELS.map((r) => [r, `roughness-${r}`, t(`properties.roughness_${r}`)])}
          {...rowProps}
        />
      </Section>

      <ShadowSection t={t} selectedElements={selectedElements} onChange={onChange} />

      {allLinear && (
        <ArrowheadsSection t={t} selectedElements={selectedElements} onChange={onChange} />
      )}

      {allArrow && (
        <ArrowTypeSection t={t} selectedElements={selectedElements} onChange={onChange} />
      )}

      <TextSection
        t={t}
        selectedElements={selectedElements}
        labelElements={labelElements}
        onChange={onChange}
        onSetTextStyle={onSetTextStyle}
      />

      {soleTable && onTableAction && (
        <TableSection t={t} table={soleTable} onChange={onChange} onTableAction={onTableAction} />
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
        <ChoiceRow
          field="opacity"
          items={OPACITY_STEPS.map((o) => [o, `opacity-${o}`, `${o}%`])}
          {...rowProps}
        />
      </Section>

      {(canGroup || canUngroup) && (
        <GroupSection
          t={t}
          canGroup={canGroup}
          canUngroup={canUngroup}
          onGroup={onGroup}
          onUngroup={onUngroup}
        />
      )}

      {canGroup && (
        <ArrangeSection
          t={t}
          count={selectedElements.length}
          onAlign={onAlign}
          onDistribute={onDistribute}
          onTidy={onTidy}
        />
      )}

      {!selectedElements.every((el) => el.locked) && <FlipRow t={t} onFlip={onFlip} />}

      {onResetCrop && sole?.type === "image" && sole.crop && !sole.locked && (
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
