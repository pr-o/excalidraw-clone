import { getElementsBounds } from "./bounds"
import type { ExcalidrawElement } from "./types"

export type Stats =
  | { kind: "scene"; elementCount: number }
  | {
      kind: "single"
      id: string
      x: number
      y: number
      width: number
      height: number
      angleDeg: number
    }
  | { kind: "multi"; count: number; x: number; y: number; width: number; height: number }

export function computeStats(
  selectedElements: readonly ExcalidrawElement[],
  allElements: readonly ExcalidrawElement[],
): Stats {
  if (selectedElements.length === 0) {
    return {
      kind: "scene",
      elementCount: allElements.filter((e) => !e.isDeleted).length,
    }
  }
  if (selectedElements.length === 1) {
    const el = selectedElements[0]!
    return {
      kind: "single",
      id: el.id,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      angleDeg: (el.angle * 180) / Math.PI,
    }
  }
  // 2+ selected, none deleted (selection state never references deleted
  // elements) — getElementsBounds only returns null for an empty or
  // fully-deleted input, neither of which is reachable here.
  const bounds = getElementsBounds(selectedElements)!
  return {
    kind: "multi",
    count: selectedElements.length,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}
