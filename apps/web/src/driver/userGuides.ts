import {
  viewportToScene,
  type Point,
  type UserGuides,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import type { Scene } from "@excalidraw-clone/scene"

/** An in-flight guide drag. `index` -1 means the guide is not (or no longer)
 *  placed: a new guide still over its ruler, or one dragged back onto it. */
export interface GuideDrag {
  axis: "x" | "y"
  index: number
}

/** One pointer move of a guide drag. `value` is the scene coordinate, or null
 *  when the pointer is over the guide's own ruler (which deletes it). */
export function dragGuideTo(
  guides: UserGuides,
  drag: GuideDrag,
  value: number | null,
): { guides: UserGuides; drag: GuideDrag } {
  const list = guides[drag.axis]
  if (value === null) {
    if (drag.index < 0) return { guides, drag }
    const next = list.filter((_, i) => i !== drag.index)
    return { guides: { ...guides, [drag.axis]: next }, drag: { ...drag, index: -1 } }
  }
  if (drag.index < 0) {
    return {
      guides: { ...guides, [drag.axis]: [...list, value] },
      drag: { ...drag, index: list.length },
    }
  }
  const next = list.map((v, i) => (i === drag.index ? value : v))
  return { guides: { ...guides, [drag.axis]: next }, drag }
}

export const RULER_SIZE = 20

/** Scene coordinate a guide on `axis` takes at viewport point `vp`, or null
 *  while the pointer is over that guide's own ruler (drop there deletes). */
export function guideValueAt(axis: "x" | "y", vp: Point, view: ViewTransform): number | null {
  if (vp[axis] < RULER_SIZE) return null
  return viewportToScene(vp, view)[axis]
}

/** Applies one move of a guide drag straight to the page's scene. Guides are
 *  not on the element undo stack (see Scene.setGuides), so live updates are fine. */
export function applyGuideDrag(scene: Scene, drag: GuideDrag, value: number | null): GuideDrag {
  const next = dragGuideTo(scene.getGuides(), drag, value)
  if (next.guides !== scene.getGuides()) scene.setGuides(next.guides)
  return next.drag
}
