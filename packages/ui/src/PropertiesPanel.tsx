import {
  isLinearElement,
  type AlignEdge,
  type GraphLayoutMode,
  type DistributeAxis,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
  type FillStyle,
  type Roughness,
  type SpanStyle,
  type StrokeStyle,
  type StrokeWidth,
} from "@excalidraw-clone/scene"
import { Icon } from "./shared/Icon"
import { ArrangeSection, FlipRow, GroupSection } from "./properties/ArrangeSections"
import { ArrowheadsSection, ArrowTypeSection } from "./properties/ArrowSections"
import { BackgroundSection } from "./properties/BackgroundSection"
import {
  ACTION,
  Choice,
  ChoiceRow,
  commonValue,
  Divider,
  IconAction,
  Section,
  Swatches,
} from "./properties/controls"
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
  /** Graph-aware layout of the connected selection; omit to hide the buttons. */
  onAutoLayout?: (mode: GraphLayoutMode) => void
  /** True when the selection has arrows connecting its shapes (enables `onAutoLayout`). */
  canAutoLayout?: boolean
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
  /** Phones show the panel as a bottom sheet; this hides it (a close button shown < 480px). */
  onClose?: () => void
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
  onAutoLayout,
  canAutoLayout,
  onGroup,
  onUngroup,
  onLock,
  onFlip,
  onSetTextStyle,
  onTableAction,
  onResetCrop,
  onClose,
  className,
}: PropertiesPanelProps): React.ReactElement | null {
  if (selectedElements.length === 0) return null

  const strokeWidth = commonValue(selectedElements, "strokeWidth")
  const roundness = commonValue(selectedElements, "roundness")
  const isRound = roundness !== undefined && roundness !== null
  const isSharp = roundness !== undefined && !isRound
  const allLinear = selectedElements.every(isLinearElement)
  const allArrow = allLinear && selectedElements.every((e) => e.type === "arrow")
  const sole = selectedElements.length === 1 ? selectedElements[0] : undefined
  const soleTable = sole?.type === "table" ? sole : undefined
  const canGroup = selectedElements.length >= 2
  const canUngroup = selectedElements.some((el) => el.groupIds.length > 0)
  const rowProps = { from: selectedElements, onChange }

  const unlocked = !selectedElements.every((el) => el.locked)

  return (
    <aside
      className={`flex max-h-[calc(100vh-8rem)] w-60 flex-col gap-3 overflow-y-auto rounded-xl bg-panel p-3 shadow-panel max-[480px]:max-h-[45vh] max-[480px]:w-full max-[480px]:rounded-b-none ${className ?? ""}`}
      aria-label={t("properties.label")}
    >
      {onClose && (
        <div className="sticky -top-3 z-10 -mx-3 -mt-3 flex items-center justify-between bg-panel px-3 py-1 min-[480px]:hidden">
          <span className="text-sm font-semibold">{t("properties.label")}</span>
          <button
            type="button"
            onClick={onClose}
            data-testid="properties-close"
            aria-label={t("common.close")}
            title={t("common.close")}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-panel-hover"
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      <Section id="stroke" label={t("properties.stroke")}>
        <Swatches
          t={t}
          colors={STROKE_COLORS}
          current={commonValue(selectedElements, "strokeColor")}
          pick={(c) => onChange({ strokeColor: c })}
          prefix="stroke"
        />
      </Section>

      <Section id="strokeWidth" label={t("properties.strokeWidth")}>
        <div className="flex gap-1">
          {STROKE_WIDTHS.map((w) => (
            <Choice
              key={w}
              data-testid={`stroke-width-${w}`}
              aria-label={`${t("properties.strokeWidth")} ${w}px`}
              title={`${t("properties.strokeWidth")} ${w}px`}
              pressed={strokeWidth === w}
              onClick={() => onChange({ strokeWidth: w })}
              className="h-8 flex-1"
            >
              <div style={{ height: `${w}px` }} className="mx-auto w-5 bg-current" aria-hidden />
            </Choice>
          ))}
        </div>
      </Section>

      <Section id="strokeStyle" label={t("properties.strokeStyle")}>
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

      <Divider />

      <BackgroundSection
        t={t}
        selectedElements={selectedElements}
        backgroundColor={commonValue(selectedElements, "backgroundColor")}
        onChange={onChange}
      />

      <Section id="fillStyle" label={t("properties.fillStyle")}>
        <ChoiceRow
          field="fillStyle"
          items={FILL_STYLES.map((s) => [s, `fill-style-${s}`, t(`properties.fillStyle_${s}`)])}
          {...rowProps}
        />
      </Section>

      <Divider />

      <Section id="roughness" label={t("properties.roughness")}>
        <ChoiceRow
          field="roughness"
          items={ROUGHNESS_LEVELS.map((r) => [r, `roughness-${r}`, t(`properties.roughness_${r}`)])}
          {...rowProps}
        />
      </Section>

      <Section id="roundness" label={t("properties.roundness")}>
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

      <Section id="opacity" label={t("properties.opacity")}>
        <ChoiceRow
          field="opacity"
          items={OPACITY_STEPS.map((o) => [o, `opacity-${o}`, `${o}%`])}
          {...rowProps}
        />
      </Section>

      <ShadowSection t={t} selectedElements={selectedElements} onChange={onChange} />

      {allLinear && (
        <>
          <Divider />
          <ArrowheadsSection t={t} selectedElements={selectedElements} onChange={onChange} />
          {allArrow && (
            <ArrowTypeSection t={t} selectedElements={selectedElements} onChange={onChange} />
          )}
        </>
      )}

      <TextSection
        t={t}
        selectedElements={selectedElements}
        labelElements={labelElements}
        onChange={onChange}
        onSetTextStyle={onSetTextStyle}
      />

      {soleTable && onTableAction && (
        <>
          <Divider />
          <TableSection t={t} table={soleTable} onChange={onChange} onTableAction={onTableAction} />
        </>
      )}

      {(canGroup || canUngroup) && (
        <>
          <Divider />
          <GroupSection
            t={t}
            canGroup={canGroup}
            canUngroup={canUngroup}
            onGroup={onGroup}
            onUngroup={onUngroup}
          />
        </>
      )}

      {canGroup && (
        <ArrangeSection
          t={t}
          count={selectedElements.length}
          onAlign={onAlign}
          onDistribute={onDistribute}
          onTidy={onTidy}
          {...(onAutoLayout ? { onAutoLayout } : {})}
          canAutoLayout={canAutoLayout ?? false}
        />
      )}

      <Divider />

      <Section id="actions" label={t("properties.actions")}>
        <div className="flex gap-1">
          {unlocked && <FlipRow t={t} onFlip={onFlip} />}
          <IconAction label={t("properties.duplicate")} icon="duplicate" onClick={onDuplicate} />
          <IconAction
            label={t("properties.lock")}
            icon="lock"
            onClick={onLock}
            data-testid="panel-lock"
          />
          <IconAction label={t("properties.delete")} icon="trash" onClick={onDelete} danger />
        </div>
        {onResetCrop && sole?.type === "image" && sole.crop && !sole.locked && (
          <button
            type="button"
            data-testid="reset-crop"
            onClick={onResetCrop}
            className={`${ACTION} mt-1 w-full`}
          >
            {t("properties.reset_crop")}
          </button>
        )}
      </Section>
    </aside>
  )
}
