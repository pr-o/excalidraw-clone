import type { AlignEdge, DistributeAxis } from "@excalidraw-clone/scene"
import { ACTION, IconAction, Section, type T } from "./controls"

const ALIGN_GLYPH: Record<AlignEdge, string> = {
  left: "⇤",
  centerX: "↔",
  right: "⇥",
  top: "⤒",
  centerY: "↕",
  bottom: "⤓",
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
          <button
            key={edge}
            type="button"
            data-testid={`align-${edge}`}
            aria-label={t(`properties.align_${edge}`)}
            title={t(`properties.align_${edge}`)}
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
            title={t(`properties.distribute_${axis}`)}
            disabled={count < 3}
            onClick={() => onDistribute(axis)}
            className={`${ACTION} disabled:pointer-events-none disabled:opacity-40`}
          >
            {axis === "horizontal" ? "⇿" : "⇳"}
          </button>
        ))}
        <button
          type="button"
          data-testid="tidy-up"
          aria-label={t("properties.tidy_up")}
          title={t("properties.tidy_up")}
          onClick={onTidy}
          className={ACTION}
        >
          ▦
        </button>
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
