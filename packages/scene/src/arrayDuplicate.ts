import { getElementsBounds } from "./bounds"
import { cloneElementsWithNewIds, expandIdsToCopyClosure } from "./clone"
import type { ExcalidrawElement } from "./types"

export const ARRAY_DUPLICATE_MAX_TRACKS = 20
export const ARRAY_DUPLICATE_MAX_ELEMENTS = 2000

export interface ArrayDuplicateOptions {
  rows: number
  cols: number
  gapX: number
  gapY: number
}

const clampTracks = (n: number): number =>
  Number.isFinite(n) ? Math.min(ARRAY_DUPLICATE_MAX_TRACKS, Math.max(1, Math.floor(n))) : 1
const finite = (n: number): number => (Number.isFinite(n) ? n : 0)

/** Clones the copy-closure of the unlocked `ids` into a rows x cols grid; the
 *  original occupies cell [0,0], so rows*cols-1 copies come back (fresh ids,
 *  groups, labels and internal bindings per cell). Pitch = selection bbox + gap.
 *  Whole cells stop once ARRAY_DUPLICATE_MAX_ELEMENTS would be exceeded. */
export function arrayDuplicate(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  opts: ArrayDuplicateOptions,
): ExcalidrawElement[] {
  const unlocked = new Set(elements.filter((el) => !el.locked).map((el) => el.id))
  const picked = expandIdsToCopyClosure(
    ids.filter((id) => unlocked.has(id)),
    elements,
  )
  const bounds = getElementsBounds(picked)
  if (!bounds) return []
  const rows = clampTracks(opts.rows)
  const cols = clampTracks(opts.cols)
  const pitchX = bounds.width + finite(opts.gapX)
  const pitchY = bounds.height + finite(opts.gapY)
  const out: ExcalidrawElement[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue
      if (out.length + picked.length > ARRAY_DUPLICATE_MAX_ELEMENTS) return out
      for (const el of cloneElementsWithNewIds(picked)) {
        out.push({ ...el, x: el.x + c * pitchX, y: el.y + r * pitchY })
      }
    }
  }
  return out
}
