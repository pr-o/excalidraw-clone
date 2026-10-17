import type { UserGuides } from "./alignment-guides"
import type { Point } from "./types"

const MIN_LABEL_SPACING_PX = 50

/** Smallest 1/2/5 x 10^n scene step whose on-screen spacing is >= 50px. */
export const rulerTickStep = (zoom: number): number => {
  const raw = MIN_LABEL_SPACING_PX / zoom
  const pow = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 5, 10]) {
    // Epsilon guards float noise like 50 / 0.1 = 499.99999.
    if (m * pow >= raw - 1e-9) return m * pow
  }
  return 10 * pow
}

export interface RulerTick {
  /** Offset along the ruler in viewport px. */
  px: number
  /** Scene coordinate the tick labels. */
  value: number
}

/** Labelled ticks for one ruler axis. `scroll` is the view's scrollX/scrollY,
 *  `lengthPx` the ruler's visible length. */
export const rulerTicks = (scroll: number, zoom: number, lengthPx: number): RulerTick[] => {
  const step = rulerTickStep(zoom)
  const first = Math.ceil(-scroll / step) * step
  const ticks: RulerTick[] = []
  for (let v = first; (v + scroll) * zoom <= lengthPx; v += step) {
    // Normalise -0 and float drift (0.1 + 0.2 style) in the label value.
    const value = Number((v === 0 ? 0 : v).toPrecision(12))
    ticks.push({ px: (value + scroll) * zoom, value })
  }
  return ticks
}

export const USER_GUIDE_HIT_TOLERANCE_PX = 4

/** The user guide under a scene point, within 4 screen px. */
export const hitTestUserGuide = (
  guides: UserGuides,
  at: Point,
  zoom: number,
): { axis: "x" | "y"; index: number } | null => {
  const tol = USER_GUIDE_HIT_TOLERANCE_PX / zoom
  const xi = guides.x.findIndex((g) => Math.abs(g - at.x) <= tol)
  if (xi >= 0) return { axis: "x", index: xi }
  const yi = guides.y.findIndex((g) => Math.abs(g - at.y) <= tol)
  return yi >= 0 ? { axis: "y", index: yi } : null
}
