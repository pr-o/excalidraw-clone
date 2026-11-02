import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { Choice, type OnChange, Section, Swatches, type T } from "./controls"

// Shadow presets (scene units). Colours are 8-digit hex so swatch test ids stay simple.
const SHADOW_SIZES = {
  soft: { blur: 12, offsetX: 4, offsetY: 4 },
  medium: { blur: 6, offsetX: 6, offsetY: 6 },
  hard: { blur: 0, offsetX: 8, offsetY: 8 },
} as const
const SHADOW_COLORS: readonly string[] = ["#00000059", "#00000099", "#868e9680"]

export function ShadowSection({
  t,
  selectedElements,
  onChange,
}: {
  t: T
  selectedElements: readonly ExcalidrawElement[]
  onChange: OnChange
}): React.ReactElement | null {
  // Frames never cast a shadow (see scene elementShadow).
  const shadowTarget = selectedElements.find((e) => e.type !== "frame")
  if (!shadowTarget) return null
  const shadow = shadowTarget.shadow
  return (
    <Section id="shadow" label={t("properties.shadow")}>
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
            <Swatches
              t={t}
              colors={SHADOW_COLORS}
              current={shadow.color}
              pick={(c) => onChange({ shadow: { ...shadow, color: c } })}
              prefix="shadow-color"
            />
          </div>
        </>
      )}
    </Section>
  )
}
