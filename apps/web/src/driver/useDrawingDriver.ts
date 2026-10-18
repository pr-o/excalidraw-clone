"use client"
import {
  hitTestUserGuide,
  sceneToViewport,
  type GridSnap,
  type Point,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import { putFile } from "@excalidraw-clone/persistence"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import {
  cloneElementsWithNewIds,
  expandIdsToGroups,
  type ExcalidrawElement,
  type LibraryItem,
  type Scene,
} from "@excalidraw-clone/scene"
import {
  findHandleAt,
  TOOLS,
  type AnyToolEvent,
  type EraserState,
  type LassoState,
  type LinearState,
  type Modifiers,
  type SelectionState,
  type ToolContext,
} from "@excalidraw-clone/tools"
import { useEffect, useRef, type RefObject } from "react"
import { useAppStore } from "../store"
import { isReadOnly } from "./viewMode"
import { applyEffects } from "./effects"
import { pickElementAtPoint } from "./hitTest"
import { LaserTrail } from "./laserTrail"
import { openLink, sanitizeLinkHref } from "./link"
import {
  applyWheel,
  clientToScene,
  modifiersOf,
  pointerEventToToolEvent,
  snapScenePoint,
} from "./events"
import { pinchView } from "./pinch"
import { applyGuideDrag, guideValueAt, type GuideDrag } from "./userGuides"

const GHOST_STROKE = "#6b46c1"

const SNAPPABLE_TOOLS: ReadonlySet<string> = new Set([
  "selection",
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "image",
])

function placeLibraryItem(item: LibraryItem, x: number, y: number, scene: Scene): void {
  if (item.files) {
    for (const bin of Object.values(item.files)) {
      void putFile(bin)
    }
  }
  const placed: ExcalidrawElement[] = cloneElementsWithNewIds(item.elements).map((el) => ({
    ...el,
    x: el.x + x,
    y: el.y + y,
  }))
  scene.mutate((draft) => {
    draft.push(...placed)
  })
  useAppStore.getState().setSelection(placed.map((e) => e.id))
}

function drawGhost(
  overlay: HTMLCanvasElement,
  item: LibraryItem,
  scenePoint: { x: number; y: number },
  view: { scrollX: number; scrollY: number; zoom: number },
): void {
  const ctx = overlay.getContext("2d")
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, overlay.width, overlay.height)
  ctx.save()
  ctx.globalAlpha = 0.6
  ctx.strokeStyle = GHOST_STROKE
  ctx.lineWidth = 1
  for (const el of item.elements) {
    const tl = sceneToViewport({ x: el.x + scenePoint.x, y: el.y + scenePoint.y }, view)
    const w = (el.width ?? 10) * view.zoom
    const h = (el.height ?? 10) * view.zoom
    ctx.strokeRect(tl.x, tl.y, w, h)
  }
  ctx.restore()
}

interface DriverOptions {
  scene: Scene
  canvasRef: RefObject<HTMLCanvasElement | null>
  overlayRef: RefObject<HTMLCanvasElement | null>
  laserRef: RefObject<HTMLCanvasElement | null>
  onReady?: (renderer: CanvasRenderer) => void
  onTeardown?: () => void
}

export function useDrawingDriver({
  scene,
  canvasRef,
  overlayRef,
  laserRef,
  onReady,
  onTeardown,
}: DriverOptions): void {
  const rendererRef = useRef<CanvasRenderer | null>(null)
  const spaceHeldRef = useRef(false)
  const panDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startScrollX: number
    startScrollY: number
  } | null>(null)
  // When Space is released mid-pan while the pointer is still down, the tool
  // never received a matching pointerDown for this gesture. Mark the pointer as
  // orphaned so its remaining move/up events are suppressed until it lifts,
  // preventing a phantom (move + up without down) dispatch into the active tool.
  const orphanedPointerRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return

    const laserCanvas = laserRef.current
    if (!laserCanvas) return
    const laser = new LaserTrail(laserCanvas, () => {
      const s = useAppStore.getState()
      return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }
    })

    const initial = useAppStore.getState()
    const renderer = new CanvasRenderer(canvas, scene, {
      overlayCanvas: overlay,
      theme: initial.resolvedTheme,
      canvasBg: initial.canvasBg,
    })
    rendererRef.current = renderer
    renderer.setShowUserGuides(initial.rulersVisible && !isReadOnly(initial))
    renderer.start()
    onReady?.(renderer)

    const unsubStore = useAppStore.subscribe((s, prev) => {
      if (s.resolvedTheme !== prev.resolvedTheme) renderer.setTheme(s.resolvedTheme)
      if (s.canvasBg !== prev.canvasBg) renderer.setCanvasBg(s.canvasBg)
      if (s.scrollX !== prev.scrollX || s.scrollY !== prev.scrollY || s.zoom !== prev.zoom) {
        renderer.setViewTransform({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom })
      }
      if (s.gridEnabled !== prev.gridEnabled || s.gridSize !== prev.gridSize) {
        renderer.setGrid({ enabled: s.gridEnabled, size: s.gridSize })
      }
      if (s.selectedIds !== prev.selectedIds) renderer.setSelection(s.selectedIds)
      if (s.textEditElementId !== prev.textEditElementId || s.textEditCell !== prev.textEditCell) {
        // A table stays drawn while one of its cells is edited; only that cell's text hides.
        renderer.setHiddenElement(s.textEditElementId, s.textEditCell)
      }
      if (s.cropElementId !== prev.cropElementId) renderer.setCropElement(s.cropElementId)
      // Crop mode lasts only while that one image stays the sole selection on the
      // selection tool; page switches, tool switches and clicking away all break it.
      if (
        s.cropElementId !== null &&
        (s.activeTool !== "selection" ||
          s.selectedIds.length !== 1 ||
          s.selectedIds[0] !== s.cropElementId)
      ) {
        s.setCropElementId(null)
        s.resetToolState("selection")
      }
      if (s.activeGuides !== prev.activeGuides) renderer.setGuides(s.activeGuides)
      if (
        s.rulersVisible !== prev.rulersVisible ||
        s.presenting !== prev.presenting ||
        s.viewMode !== prev.viewMode
      ) {
        renderer.setShowUserGuides(s.rulersVisible && !isReadOnly(s))
      }
      if (s.activeTool !== prev.activeTool && prev.activeTool === "laser") laser.clear()
      if (
        s.activeTool !== prev.activeTool &&
        (prev.activeTool === "lasso" || prev.activeTool === "eraser")
      ) {
        renderer.setLasso([])
      }
      // Switching away mid-drag cancels the erase like Escape (restores live erasures, no history).
      if (s.activeTool !== prev.activeTool && prev.activeTool === "eraser") {
        if ((s.toolStates.eraser as EraserState | undefined)?.phase === "erasing") {
          dispatch(
            { type: "escape" },
            { shift: false, alt: false, ctrl: false, meta: false },
            "eraser",
          )
        }
        useAppStore.getState().resetToolState("eraser")
      }
    })

    const resolveGrid = (): GridSnap => {
      const s = useAppStore.getState()
      return {
        enabled: s.gridEnabled && SNAPPABLE_TOOLS.has(s.activeTool),
        size: s.gridSize,
      }
    }

    const viewOf = (s: ReturnType<typeof useAppStore.getState>): ViewTransform => ({
      scrollX: s.scrollX,
      scrollY: s.scrollY,
      zoom: s.zoom,
    })
    const snappedScenePoint = (e: PointerEvent | MouseEvent): Point =>
      snapScenePoint(clientToScene(canvas, viewOf(useAppStore.getState()), e), resolveGrid(), e)

    const dispatch = (
      event: AnyToolEvent,
      modifiers: Modifiers,
      toolName = useAppStore.getState().activeTool,
    ): void => {
      const store = useAppStore.getState()
      const tool = TOOLS[toolName]
      const currentState = store.toolStates[toolName] ?? tool.initial
      const ctx: ToolContext = {
        readElements: () => scene.getElements(),
        hitTest: (at) => pickElementAtPoint(scene.getElements(), at),
        viewTransform: viewOf(store),
        modifiers,
        selectedIds: store.selectedIds,
        grid: resolveGrid(),
        // Guides only snap while visible (they show and hide with the rulers).
        ...(store.rulersVisible ? { userGuides: scene.getGuides() } : {}),
      }
      const [next, effects] = tool.reduce(currentState, event, ctx)
      useAppStore.getState().setToolState(toolName, next)
      applyEffects(scene, effects, laser)
      if (toolName === "selection") {
        const sel = next as SelectionState
        renderer.setMarquee(sel.phase === "marquee" ? { start: sel.start, end: sel.current } : null)
      }
      if (toolName === "lasso") {
        const lasso = next as LassoState
        renderer.setLasso(lasso.phase === "drawing" ? lasso.points : [])
      }
      if (toolName === "eraser") {
        const eraser = next as EraserState
        renderer.setLasso(eraser.phase === "erasing" ? eraser.trail : [])
      }
      if (toolName === "arrow" && (next as LinearState).phase === "drawing") {
        const cand = (next as Extract<LinearState, { phase: "drawing" }>).endBindId
        renderer.setBindingHighlight(cand ? [cand] : [])
      } else if (
        toolName === "selection" &&
        (next as SelectionState).phase === "endpointDragging"
      ) {
        const cand = (next as Extract<SelectionState, { phase: "endpointDragging" }>)
          .candidateBindId
        renderer.setBindingHighlight(cand ? [cand] : [])
      } else {
        renderer.setBindingHighlight([])
      }
    }

    const dispatchPointer = (
      type: "pointerDown" | "pointerMove" | "pointerUp",
      e: PointerEvent,
    ): void => {
      const store = useAppStore.getState()
      // Presentation mode is read-only. The laser pointer is the one exception:
      // it is a presentation aid and writes nothing to the scene.
      if (isReadOnly(store) && store.activeTool !== "laser") return
      const event = pointerEventToToolEvent(type, canvas, viewOf(store), resolveGrid(), e)
      if ("at" in event) store.setLastScenePointer(event.at)
      dispatch(event, modifiersOf(e))
    }

    const onWheel = (e: WheelEvent): void => {
      // Read-only while presenting: the slide framing owns the viewport.
      if (useAppStore.getState().presenting) return
      e.preventDefault()
      const store = useAppStore.getState()
      store.setView(applyWheel(canvas, viewOf(store), e))
    }

    const isTypingTarget = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (
        e.code !== "Space" ||
        isTypingTarget(e.target) ||
        spaceHeldRef.current ||
        // No Space-drag panning while presenting: the viewport is read-only.
        useAppStore.getState().presenting
      ) {
        return
      }
      spaceHeldRef.current = true
      if (!panDragRef.current) canvas.style.cursor = "grab"
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code !== "Space") return
      spaceHeldRef.current = false
      const drag = panDragRef.current
      if (drag) {
        // Pointer is still down mid-pan: orphan it so the rest of this gesture
        // never leaks into dispatchPointer as a down-less move/up pair.
        orphanedPointerRef.current = drag.pointerId
        canvas.releasePointerCapture(drag.pointerId)
      }
      panDragRef.current = null
      canvas.style.cursor = ""
    }

    // Two-finger pan/zoom. Once a second touch lands the one-finger gesture is
    // cancelled and every touch is swallowed until all fingers lift.
    const touches = new Map<number, Point>()
    let pinch: { ids: [number, number]; view: ViewTransform; from: [Point, Point] } | null = null
    let touchDead = false
    const canvasPoint = (e: PointerEvent): Point => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    /** Returns true when the event was consumed by the touch gesture layer. */
    const handleTouch = (type: "down" | "move" | "up", e: PointerEvent): boolean => {
      if (e.pointerType !== "touch" || useAppStore.getState().presenting) return false
      if (type === "up") {
        touches.delete(e.pointerId)
        pinch = null
        const consumed = touchDead
        if (touches.size === 0) touchDead = false
        if (consumed) canvas.releasePointerCapture(e.pointerId)
        return consumed
      }
      touches.set(e.pointerId, canvasPoint(e))
      if (type === "down" && !touchDead && touches.size === 2) {
        dispatch({ type: "escape" }, { shift: false, alt: false, ctrl: false, meta: false })
        touchDead = true
        const [a, b] = [...touches.keys()] as [number, number]
        const from: [Point, Point] = [touches.get(a)!, touches.get(b)!]
        pinch = { ids: [a, b], view: viewOf(useAppStore.getState()), from }
        canvas.setPointerCapture(e.pointerId)
        return true
      }
      if (touchDead && pinch) {
        const [a, b] = pinch.ids
        const pa = touches.get(a)
        const pb = touches.get(b)
        if (pa && pb) useAppStore.getState().setView(pinchView(pinch.view, pinch.from, [pa, pb]))
      }
      return touchDead
    }

    // Ruler guides on the canvas: only the exact line (4px) captures the
    // pointer, only with the selection tool and rulers shown, so elements
    // beneath stay selectable everywhere else.
    let guideDrag: GuideDrag | null = null
    let guideCursor = false
    const guideAt = (e: MouseEvent): { axis: "x" | "y"; index: number } | null => {
      const store = useAppStore.getState()
      if (!store.rulersVisible || isReadOnly(store) || store.activeTool !== "selection") return null
      const at = clientToScene(canvas, viewOf(store), e)
      return hitTestUserGuide(scene.getGuides(), at, store.zoom)
    }

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return
      if (handleTouch("down", e)) return
      if (useAppStore.getState().contextMenu) {
        useAppStore.getState().setContextMenu(null)
        return
      }
      // A fresh, real pointerDown for this id proves any lingering orphaned
      // state is stale (e.g. the orphaned gesture's pointerUp landed on a UI
      // sibling after capture was released, so our up handler never fired).
      // Clear it so this new gesture is never wrongly suppressed.
      if (orphanedPointerRef.current === e.pointerId) orphanedPointerRef.current = null
      // `spaceHeldRef` can still be set from a Space held down before
      // presentation started, so gate the pan gesture here too.
      const vs = useAppStore.getState()
      if (vs.viewMode && !vs.presenting && vs.activeTool !== "laser") {
        // View mode: a click on a linked element opens it (no modifier needed).
        const hit = pickElementAtPoint(scene.getElements(), clientToScene(canvas, viewOf(vs), e))
        if (hit && sanitizeLinkHref(hit.link)) {
          openLink(hit.link)
          return
        }
      }
      // Left-drag on empty canvas pans in view mode (hand-tool behaviour).
      const panWanted = spaceHeldRef.current || (vs.viewMode && vs.activeTool !== "laser")
      if (panWanted && !vs.presenting) {
        canvas.setPointerCapture(e.pointerId)
        const store = useAppStore.getState()
        panDragRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startScrollX: store.scrollX,
          startScrollY: store.scrollY,
        }
        canvas.style.cursor = "grabbing"
        return
      }
      const guideHit = guideAt(e)
      if (guideHit) {
        canvas.setPointerCapture(e.pointerId)
        guideDrag = guideHit
        return
      }
      const store = useAppStore.getState()
      const pending = store.pendingItem
      if (pending) {
        // Read-only while presenting: placing a library item mutates the scene.
        if (isReadOnly(store)) return
        const at = snappedScenePoint(e)
        placeLibraryItem(pending, at.x, at.y, scene)
        store.clearPendingItem()
        overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
        return
      }
      // Cmd/Ctrl-click on a linked element opens its link (selection tool only,
      // so drawing-tool modifier behavior is untouched; Cmd/Ctrl is otherwise
      // just "bypass snap" at drag time and does not change a plain click).
      // Apple: Ctrl-click is the system secondary click, so require Cmd there;
      // elsewhere require Ctrl.
      const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const openModifier = isApple ? e.metaKey : e.ctrlKey
      if (store.activeTool === "selection" && openModifier) {
        const at = clientToScene(canvas, viewOf(store), e)
        const hit = pickElementAtPoint(scene.getElements(), at)
        // Only an *openable* link swallows the click; a present-but-unopenable
        // one (typo, rejected scheme) falls through to normal selection rather
        // than making the element unclickable.
        if (hit && sanitizeLinkHref(hit.link)) {
          openLink(hit.link)
          return
        }
      }
      canvas.setPointerCapture(e.pointerId)
      dispatchPointer("pointerDown", e)
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (handleTouch("move", e)) return
      if (orphanedPointerRef.current === e.pointerId) return
      const drag = panDragRef.current
      if (drag) {
        const store = useAppStore.getState()
        const dx = (e.clientX - drag.startClientX) / store.zoom
        const dy = (e.clientY - drag.startClientY) / store.zoom
        store.setView({
          scrollX: drag.startScrollX + dx,
          scrollY: drag.startScrollY + dy,
          zoom: store.zoom,
        })
        return
      }
      if (guideDrag) {
        const r = canvas.getBoundingClientRect()
        const vp = { x: e.clientX - r.left, y: e.clientY - r.top }
        const value = guideValueAt(guideDrag.axis, vp, viewOf(useAppStore.getState()))
        guideDrag = applyGuideDrag(scene, guideDrag, value)
        return
      }
      if (e.buttons === 0 && !spaceHeldRef.current) {
        const hover = guideAt(e)
        // A selected table's column/row border also shows a resize cursor.
        const vs = useAppStore.getState()
        const border =
          !hover && vs.activeTool === "selection" && vs.selectedIds.length === 1
            ? findHandleAt(
                clientToScene(canvas, viewOf(vs), e),
                vs.selectedIds,
                scene.getElements(),
                viewOf(vs),
              )
            : null
        const axis = hover ? hover.axis : border?.kind === "tableBorder" ? border.axis : null
        if (axis !== null || guideCursor) {
          canvas.style.cursor =
            axis === null ? "" : axis === "x" || axis === "col" ? "col-resize" : "row-resize"
          guideCursor = axis !== null
        }
      }
      const store = useAppStore.getState()
      const pending = store.pendingItem
      if (pending) {
        // Read-only while presenting: no ghost preview on the overlay.
        if (isReadOnly(store)) return
        drawGhost(overlay, pending, snappedScenePoint(e), viewOf(store))
        return
      }
      // Hover feeds the link indicator; the tool dispatch below is gated off.
      if (store.viewMode) store.setLastScenePointer(clientToScene(canvas, viewOf(store), e))
      dispatchPointer("pointerMove", e)
    }
    const onPointerUp = (e: PointerEvent): void => {
      if (handleTouch("up", e)) return
      if (orphanedPointerRef.current === e.pointerId) {
        // End of the orphaned gesture: clear the mark so a fresh press works
        // normally, and swallow this up so no down-less pointerUp is dispatched.
        orphanedPointerRef.current = null
        canvas.releasePointerCapture(e.pointerId)
        return
      }
      if (panDragRef.current) {
        panDragRef.current = null
        canvas.releasePointerCapture(e.pointerId)
        canvas.style.cursor = spaceHeldRef.current ? "grab" : ""
        return
      }
      if (guideDrag) {
        guideDrag = null
        canvas.releasePointerCapture(e.pointerId)
        return
      }
      if (useAppStore.getState().pendingItem) return
      canvas.releasePointerCapture(e.pointerId)
      dispatchPointer("pointerUp", e)
    }
    const onDoubleClick = (e: MouseEvent): void => {
      // Read-only while presenting (laser has no double-click behaviour).
      if (isReadOnly(useAppStore.getState())) return
      const guideHit = guideAt(e)
      if (guideHit) {
        applyGuideDrag(scene, guideHit, null)
        return
      }
      dispatch({ type: "doubleClick", at: snappedScenePoint(e) }, modifiersOf(e))
    }

    const onContextMenu = (e: MouseEvent): void => {
      // No editor context menu while presenting; let the browser handle it.
      if (isReadOnly(useAppStore.getState())) {
        // View mode hides the editor menu outright; presenting leaves the browser's.
        if (useAppStore.getState().viewMode) e.preventDefault()
        return
      }
      e.preventDefault()
      const store = useAppStore.getState()
      const scenePoint = clientToScene(canvas, viewOf(store), e)
      const hit = pickElementAtPoint(scene.getElements(), scenePoint, { includeLocked: true })
      if (!hit) {
        store.setContextMenu({ x: e.clientX, y: e.clientY, scenePoint, target: "canvas" })
        return
      }
      if (hit.locked) {
        store.setContextMenu({
          x: e.clientX,
          y: e.clientY,
          scenePoint,
          target: "element",
          elementIds: [hit.id],
          locked: true,
        })
        return
      }
      const alreadySelected = store.selectedIds.includes(hit.id)
      const elementIds = alreadySelected
        ? [...store.selectedIds]
        : expandIdsToGroups([hit.id], scene.getElements())
      if (!alreadySelected) store.setSelection(elementIds)
      store.setContextMenu({
        x: e.clientX,
        y: e.clientY,
        scenePoint,
        target: "element",
        elementIds,
        locked: false,
      })
    }

    const onPointerEnter = (): void => useAppStore.getState().setPointerOverCanvas(true)
    const onPointerLeave = (): void => useAppStore.getState().setPointerOverCanvas(false)

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("dblclick", onDoubleClick)
    canvas.addEventListener("contextmenu", onContextMenu)
    canvas.addEventListener("pointerenter", onPointerEnter)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    useAppStore
      .getState()
      .setDispatchToolEvent((e) =>
        dispatch(e, { shift: false, alt: false, ctrl: false, meta: false }),
      )

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("dblclick", onDoubleClick)
      canvas.removeEventListener("contextmenu", onContextMenu)
      canvas.removeEventListener("pointerenter", onPointerEnter)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      useAppStore.getState().setPointerOverCanvas(false)
      canvas.removeEventListener("wheel", onWheel)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      useAppStore.getState().setDispatchToolEvent(null)
      unsubStore()
      laser.clear()
      renderer.stop()
      rendererRef.current = null
      onTeardown?.()
    }
  }, [scene, canvasRef, overlayRef, laserRef, onReady, onTeardown])
}
