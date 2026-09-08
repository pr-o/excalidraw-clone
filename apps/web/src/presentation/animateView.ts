import type { ViewTransform } from "@excalidraw-clone/geometry"

/** Cubic ease-in-out over t ∈ [0, 1]. */
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/**
 * Animates the view from `from` to `to` over `durationMs`, calling `onFrame`
 * once per animation frame with the interpolated transform.
 *
 * The final frame is always exactly `to` (never an interpolated near-value).
 * A non-positive `durationMs` emits a single synchronous `onFrame(to)` and
 * schedules no animation frame at all.
 *
 * Pure view-layer helper: no store, no DOM — only `requestAnimationFrame`,
 * `cancelAnimationFrame` and `performance.now` (the same time base as the
 * timestamp handed to the rAF callback).
 *
 * @returns a cancel fn that stops the animation; after it runs, `onFrame` is
 * guaranteed not to be called again.
 */
export function animateView(
  from: ViewTransform,
  to: ViewTransform,
  durationMs: number,
  onFrame: (v: ViewTransform) => void,
): () => void {
  if (durationMs <= 0) {
    onFrame(to)
    return () => {}
  }

  const start = performance.now()
  let handle: number | null = null
  let cancelled = false

  const step = (timestamp: number): void => {
    if (cancelled) return
    handle = null

    const t = Math.min(1, Math.max(0, (timestamp - start) / durationMs))
    if (t >= 1) {
      onFrame(to)
      return
    }

    const k = easeInOutCubic(t)
    onFrame({
      scrollX: lerp(from.scrollX, to.scrollX, k),
      scrollY: lerp(from.scrollY, to.scrollY, k),
      zoom: lerp(from.zoom, to.zoom, k),
    })
    handle = requestAnimationFrame(step)
  }

  handle = requestAnimationFrame(step)

  return () => {
    if (cancelled) return
    cancelled = true
    if (handle !== null) {
      cancelAnimationFrame(handle)
      handle = null
    }
  }
}
