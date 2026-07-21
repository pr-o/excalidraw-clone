import type { ExcalidrawElement } from "./types"

/** Moves matched elements to the front of the array (rendered first = visual back). */
export function sendToBack(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const moved = elements.filter((e) => selectedIds.includes(e.id))
  const remaining = elements.filter((e) => !selectedIds.includes(e.id))
  return [...moved, ...remaining]
}

/** Moves matched elements to the end of the array (rendered last = visual front). */
export function bringToFront(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const moved = elements.filter((e) => selectedIds.includes(e.id))
  const remaining = elements.filter((e) => !selectedIds.includes(e.id))
  return [...remaining, ...moved]
}

/** Swaps each matched element with its left neighbor, skipping neighbors that are also matched. */
export function sendBackward(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const result = [...elements]
  for (let i = 1; i < result.length; i += 1) {
    if (selectedIds.includes(result[i]!.id) && !selectedIds.includes(result[i - 1]!.id)) {
      ;[result[i - 1], result[i]] = [result[i]!, result[i - 1]!]
    }
  }
  return result
}

/** Swaps each matched element with its right neighbor, skipping neighbors that are also matched. */
export function bringForward(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const result = [...elements]
  for (let i = result.length - 2; i >= 0; i -= 1) {
    if (selectedIds.includes(result[i]!.id) && !selectedIds.includes(result[i + 1]!.id)) {
      ;[result[i + 1], result[i]] = [result[i]!, result[i + 1]!]
    }
  }
  return result
}
