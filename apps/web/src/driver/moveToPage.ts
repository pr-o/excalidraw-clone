import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/**
 * Eligibility rule for the context menu's "Move to page" action (single-element
 * moves only, per docs/superpowers/specs/2026-08-16-move-to-page-design.md).
 * True when `element` can be relocated to another page without leaving a
 * dangling group/frame/binding reference behind: it belongs to no group, is
 * not a frame member, carries no bound label and is not itself bound text,
 * has no live start/end binding of its own (arrow/line), and no other
 * element's binding targets it.
 */
export function canMoveElementToPage(
  element: ExcalidrawElement,
  allElements: readonly ExcalidrawElement[],
): boolean {
  if (element.groupIds.length > 0) return false
  if (element.frameId !== null) return false
  if (element.boundElements !== null && element.boundElements.length > 0) return false
  if (element.type === "text" && element.containerId !== null) return false
  if (element.type === "arrow" || element.type === "line") {
    if (element.startBinding !== null || element.endBinding !== null) return false
  }
  const isBindingTarget = allElements.some(
    (el) =>
      (el.type === "arrow" || el.type === "line") &&
      (el.startBinding?.elementId === element.id || el.endBinding?.elementId === element.id),
  )
  return !isBindingTarget
}
