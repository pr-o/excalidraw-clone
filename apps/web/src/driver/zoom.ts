import { zoomToPoint } from "@excalidraw-clone/geometry"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"

/** Zoom about the viewport centre; `next` maps the current zoom to the target zoom. */
export function zoomAboutCentre(next: (zoom: number) => number): void {
  const s = useAppStore.getState()
  const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  s.setView(zoomToPoint(viewOf(s), anchor, next(s.zoom)))
}
