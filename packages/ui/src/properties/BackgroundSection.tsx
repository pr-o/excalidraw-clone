import { type ExcalidrawElement, GRADIENT_TYPES } from "@excalidraw-clone/scene"
import { Choice, type OnChange, Section, Swatches, type T } from "./controls"

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

export function BackgroundSection({
  t,
  selectedElements,
  backgroundColor,
  onChange,
}: {
  t: T
  selectedElements: readonly ExcalidrawElement[]
  backgroundColor: string | undefined
  onChange: OnChange
}): React.ReactElement {
  // Gradient-capable shapes (see renderer gradientLine).
  const gradientTarget = selectedElements.find((e) => GRADIENT_TYPES.has(e.type))
  const gradient = gradientTarget?.gradient
  return (
    <Section label={t("properties.background")}>
      <Swatches
        t={t}
        colors={BG_COLORS}
        current={backgroundColor}
        pick={(c) => onChange({ backgroundColor: c })}
        prefix="bg"
      />
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
            <Swatches
              t={t}
              colors={GRADIENT_COLORS}
              current={gradient.to}
              pick={(c) => onChange({ gradient: { ...gradient, to: c } })}
              prefix="gradient-to"
            />
          </div>
          <div className="mt-1 flex gap-1" role="group" aria-label={t("properties.gradientAngle")}>
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
  )
}
