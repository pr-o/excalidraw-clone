import type { ExcalidrawElement } from "./types"

const partition = (
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): { moved: ExcalidrawElement[]; remaining: ExcalidrawElement[] } => {
  const ids = new Set(selectedIds)
  return {
    moved: elements.filter((e) => ids.has(e.id)),
    remaining: elements.filter((e) => !ids.has(e.id)),
  }
}

/** Moves matched elements to the front of the array (rendered first = visual back). */
export function sendToBack(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const { moved, remaining } = partition(elements, selectedIds)
  return [...moved, ...remaining]
}

/** Moves matched elements to the end of the array (rendered last = visual front). */
export function bringToFront(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const { moved, remaining } = partition(elements, selectedIds)
  return [...remaining, ...moved]
}

/** Swaps each matched element with its left neighbor, skipping neighbors that are also matched. */
export function sendBackward(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const ids = new Set(selectedIds)
  const result = [...elements]
  for (let i = 1; i < result.length; i += 1) {
    if (ids.has(result[i]!.id) && !ids.has(result[i - 1]!.id)) {
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
  const ids = new Set(selectedIds)
  const result = [...elements]
  for (let i = result.length - 2; i >= 0; i -= 1) {
    if (ids.has(result[i]!.id) && !ids.has(result[i + 1]!.id)) {
      ;[result[i + 1], result[i]] = [result[i]!, result[i + 1]!]
    }
  }
  return result
}
