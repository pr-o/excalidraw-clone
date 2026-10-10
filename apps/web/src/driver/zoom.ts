import { zoomToPoint } from "@excalidraw-clone/geometry"
import { useAppStore } from "../store"

/** Zoom about the viewport centre; `next` maps the current zoom to the target zoom. */
export function zoomAboutCentre(next: (zoom: number) => number): void {
  const s = useAppStore.getState()
  const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  s.setView(
    zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, next(s.zoom)),
  )
}
