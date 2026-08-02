import type { Point } from "@excalidraw-clone/geometry"
import { hitTestElement, type ExcalidrawElement } from "@excalidraw-clone/scene"

/** Finds the topmost element under `point`, back-to-front. Skips bound text
 *  and (unless `includeLocked`) locked elements. Frames are lowest-priority:
 *  members inside a frame win, the frame itself only catches clicks on its
 *  empty interior. */
export function pickElementAtPoint(
  elements: readonly ExcalidrawElement[],
  point: Point,
  options?: { includeLocked?: boolean },
): ExcalidrawElement | null {
  const includeLocked = options?.includeLocked ?? false
  let frameHit: ExcalidrawElement | null = null
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i] as ExcalidrawElement
    if (el.type === "text" && el.containerId !== null) continue
    if (el.locked && !includeLocked) continue
    if (!hitTestElement(el, point)) continue
    if (el.type === "frame") {
      frameHit = frameHit ?? el
      continue
    }
    return el
  }
  return frameHit
}
