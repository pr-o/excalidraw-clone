import type { AlignEdge, DistributeAxis } from "@excalidraw-clone/scene"
import { ACTION, IconAction, Section, type T } from "./controls"

const ALIGN_ICON: Record<AlignEdge, string> = {
  left: "align-left",
  centerX: "align-center-x",
  right: "align-right",
  top: "align-top",
  centerY: "align-center-y",
  bottom: "align-bottom",
}

export function GroupSection({
  t,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
}: {
  t: T
  canGroup: boolean
  canUngroup: boolean
  onGroup: () => void
  onUngroup: () => void
}): React.ReactElement {
  return (
    <Section label={t("properties.group")}>
      <div className="flex gap-1">
        <button
          type="button"
          data-testid="group-selection"
          disabled={!canGroup}
          onClick={onGroup}
          className={`${ACTION} disabled:pointer-events-none disabled:opacity-40`}
        >
          {t("properties.group")}
        </button>
        <button
          type="button"
          data-testid="ungroup-selection"
          disabled={!canUngroup}
          onClick={onUngroup}
          className={`${ACTION} disabled:pointer-events-none disabled:opacity-40`}
        >
          {t("properties.ungroup")}
        </button>
      </div>
    </Section>
  )
}

/** Align, distribute and tidy for a multi-selection. */
export function ArrangeSection({
  t,
  count,
  onAlign,
  onDistribute,
  onTidy,
}: {
  t: T
  count: number
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: DistributeAxis) => void
  onTidy: () => void
}): React.ReactElement {
  return (
    <Section label={t("properties.arrange")}>
      <div className="grid grid-cols-3 gap-1">
        {(["left", "centerX", "right", "top", "centerY", "bottom"] as const).map((edge) => (
          <IconAction
            key={edge}
            data-testid={`align-${edge}`}
            label={t(`properties.align_${edge}`)}
            icon={ALIGN_ICON[edge]}
            onClick={() => onAlign(edge)}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {(["horizontal", "vertical"] as const).map((axis) => (
          <IconAction
            key={axis}
            data-testid={`distribute-${axis}`}
            label={t(`properties.distribute_${axis}`)}
            icon={axis === "horizontal" ? "distribute-h" : "distribute-v"}
            disabled={count < 3}
            onClick={() => onDistribute(axis)}
          />
        ))}
        <IconAction
          data-testid="tidy-up"
          label={t("properties.tidy_up")}
          icon="tidy"
          onClick={onTidy}
        />
      </div>
    </Section>
  )
}

export function FlipRow({
  t,
  onFlip,
}: {
  t: T
  onFlip: (axis: "x" | "y") => void
}): React.ReactElement {
  return (
    <>
      {(
        [
          ["x", "flip_horizontal"],
          ["y", "flip_vertical"],
        ] as const
      ).map(([axis, key]) => (
        <IconAction
          key={axis}
          data-testid={`flip-${axis}`}
          label={t(`properties.${key}`)}
          icon={`flip-${axis}`}
          onClick={() => onFlip(axis)}
        />
      ))}
    </>
  )
}
