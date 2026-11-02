import { getElementsBounds, type ExcalidrawElement, isBoundLabel } from "@excalidraw-clone/scene"

/** Keyboard-navigable units in z-order (back to front, the reverse of the
 *  layers panel): each ungrouped element, or one entry per outermost group.
 *  Bound labels follow their container and locked elements are skipped, as
 *  with pointer selection. */
export function navigationUnits(elements: readonly ExcalidrawElement[]): string[][] {
  const units: string[][] = []
  const groupUnit = new Map<string, string[]>()
  for (const el of elements) {
    if (el.isDeleted || el.locked) continue
    if (isBoundLabel(el)) continue
    const outer = el.groupIds[el.groupIds.length - 1]
    if (outer === undefined) {
      units.push([el.id])
      continue
    }
    const unit = groupUnit.get(outer)
    if (unit) unit.push(el.id)
    else {
      const fresh = [el.id]
      groupUnit.set(outer, fresh)
      units.push(fresh)
    }
  }
  return units
}

/** The unit to select after (`dir` 1) or before (-1) the current selection, or
 *  null when moving past either end (so Tab can leave the canvas: no trap). */
export function stepSelection(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
  dir: 1 | -1,
): { ids: string[]; index: number; count: number } | null {
  const units = navigationUnits(elements)
  const selected = new Set(selectedIds)
  let current = -1
  // Anchor on the front-most selected unit going forward, the back-most going back.
  for (let i = 0; i < units.length; i += 1) {
    if (!units[i]!.some((id) => selected.has(id))) continue
    if (dir === -1 && current !== -1) continue
    current = i
  }
  const next = current === -1 ? (dir === 1 ? 0 : units.length - 1) : current + dir
  if (next < 0 || next >= units.length) return null
  return { ids: units[next]!, index: next, count: units.length }
}

type T = (key: string, opts?: Record<string, unknown>) => string

/** Screen-reader description of a navigation unit: type, label, position, size. */
export function describeUnit(
  ids: readonly string[],
  elements: readonly ExcalidrawElement[],
  index: number,
  count: number,
  t: T,
): string {
  const idSet = new Set(ids)
  const members = elements.filter((e) => idSet.has(e.id))
  const first = members[0]
  if (!first) return ""
  const labelOf = (el: ExcalidrawElement): string => {
    if (el.type === "text") return el.text
    if (el.type === "frame") return el.name ?? ""
    const ref = el.boundElements?.find((b) => b.type === "text")
    const bound = ref && elements.find((e) => e.id === ref.id)
    return bound?.type === "text" ? bound.text : ""
  }
  const text = labelOf(first).trim().replace(/\s+/g, " ").slice(0, 80)
  const b = getElementsBounds(members) ?? { x: first.x, y: first.y, width: 0, height: 0 }
  const type = t(`toolbar.${first.type}`)
  return t("a11y.element", {
    type: members.length > 1 ? t("a11y.groupOf", { count: members.length }) + type : type,
    label: text ? t("a11y.elementLabel", { text }) : "",
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
    index: index + 1,
    count,
  })
}
