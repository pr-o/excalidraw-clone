import {
  boundsCenter,
  boundsContains,
  centerViewOn,
  viewportSceneRect,
} from "@excalidraw-clone/geometry"
import { getElementsBounds, type Scene } from "@excalidraw-clone/scene"
import i18next from "i18next"
import { announce } from "../components/LiveAnnouncer"
import { describeUnit, stepSelection } from "../keyboard/canvasNavigation"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"
import { NO_MODIFIERS, type ToolDispatch } from "./toolDispatch"
import { isReadOnly } from "./viewMode"

/**
 * Keyboard element navigation while the canvas has focus. Tab/Enter are never tool keys
 * (rebinding accepts single printable characters only); arrow-key nudge and Escape stay
 * with the global shortcuts.
 */
export function createCanvasKeyNav(
  canvas: HTMLCanvasElement,
  scene: Scene,
  dispatch: ToolDispatch,
) {
  const stepToNextElement = (e: KeyboardEvent): void => {
    const store = useAppStore.getState()
    const elements = scene.getElements()
    const step = stepSelection(elements, store.selectedIds, e.shiftKey ? -1 : 1)
    // Past either end: let focus leave the canvas (no keyboard trap).
    if (!step) return
    e.preventDefault()
    if (store.activeTool !== "selection") store.setActiveTool("selection")
    store.setSelection(step.ids)
    const idSet = new Set(step.ids)
    const bounds = getElementsBounds(elements.filter((el) => idSet.has(el.id)))
    const r = canvas.getBoundingClientRect()
    const view = viewOf(store)
    if (bounds && !boundsContains(viewportSceneRect(view, r.width, r.height), bounds)) {
      store.setView(centerViewOn(boundsCenter(bounds), view, r.width, r.height))
    }
    announce(
      describeUnit(step.ids, elements, step.index, step.count, (key, opts) =>
        opts ? i18next.t(key, opts) : i18next.t(key),
      ),
    )
  }

  /** Enter edits the selected element (the keyboard twin of a double-click). */
  const editSelected = (e: KeyboardEvent): void => {
    const store = useAppStore.getState()
    const id = store.selectedIds[0]
    const el = id === undefined ? undefined : scene.getElements().find((x) => x.id === id)
    if (!el) return
    e.preventDefault()
    const b = getElementsBounds([el])
    const at = b ? boundsCenter(b) : { x: el.x, y: el.y }
    dispatch({ type: "doubleClick", at, targetId: el.id }, NO_MODIFIERS)
  }

  return function onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const store = useAppStore.getState()
    if (isReadOnly(store)) return
    if (e.key === "Tab") stepToNextElement(e)
    else if (e.key === "Enter" && !e.shiftKey && store.activeTool === "selection") editSelected(e)
  }
}
