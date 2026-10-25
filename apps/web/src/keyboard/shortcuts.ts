"use client"
import {
  duplicateElements,
  expandIdsToFrameMembers,
  flipElements,
  groupElements,
  lockElements,
  type Scene,
  ungroupElements,
} from "@excalidraw-clone/scene"
import { applyPropertiesPatch } from "../driver/applyPropertiesPatch"
import { deleteElements, patchScene, replaceElements } from "../driver/patchScene"
import { zoomAboutCentre } from "../driver/zoom"
import { toggleViewMode } from "../driver/viewMode"
import { useAppStore } from "../store"
import { type ChainDirection, createChainedShape } from "./flowchartChain"
import { applyStyle, extractStyle, type StyleClipboard } from "./styleClipboard"
import { toolForKey } from "./toolKeys"

const CHAIN_DIRECTIONS: Record<string, ChainDirection> = {
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
}

interface Bindings {
  scene: Scene
  onNextPage?: () => void
  onPrevPage?: () => void
  onToggleStats?: () => void
}

/** Ephemeral, app-lifetime style clipboard for Cmd/Ctrl+Alt+C / +V. Module-level
 *  rather than closure-level on purpose: `attachShortcuts` is re-invoked on every
 *  page switch and page CRUD, and a copied style must survive those so it can be
 *  pasted onto an element on another page. Never persisted, never cross-tab. */
let styleClipboard: StyleClipboard | null = null

export function attachShortcuts({
  scene,
  onNextPage,
  onPrevPage,
  onToggleStats,
}: Bindings): () => void {
  const handler = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return
    }
    // Presentation mode is read-only: every editor shortcut below is inert.
    // PresentationHost owns the presentation keys (nav / Escape) on a
    // capture-phase window listener, so nothing here needs to handle them.
    if (useAppStore.getState().presenting) return

    const isMeta = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

    // Before tool-key dispatch (R would pick the rectangle); `code` covers
    // layouts where Alt+R yields a symbol such as "®".
    if (e.altKey && !isMeta && (e.code === "KeyR" || key === "r")) {
      e.preventDefault()
      toggleViewMode()
      return
    }
    // Before tool-key dispatch and the view-mode filter (navigation stays available);
    // `code` covers Mac Alt+M yielding "µ".
    if (e.altKey && !isMeta && (e.code === "KeyM" || key === "m")) {
      e.preventDefault()
      useAppStore.getState().toggleMinimap()
      return
    }
    // View mode: only navigation, find, help and the laser survive.
    if (useAppStore.getState().viewMode) {
      const allowed =
        (isMeta && ["0", "+", "=", "-", "/", "f"].includes(key)) ||
        (e.altKey && (key === "pagedown" || key === "pageup")) ||
        (!isMeta &&
          !e.altKey &&
          toolForKey(key, useAppStore.getState().toolKeyOverrides) === "laser") ||
        key === "escape" ||
        key === "?" ||
        (e.shiftKey && key === "/")
      if (!allowed) return
    }

    if (isMeta && key === "z" && !e.shiftKey) {
      e.preventDefault()
      scene.undo()
      return
    }
    if (isMeta && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault()
      scene.redo()
      return
    }
    if (isMeta && e.shiftKey && key === "g") {
      e.preventDefault()
      const ids = useAppStore.getState().selectedIds
      patchScene(scene, ungroupElements(scene.getElements(), ids))
      return
    }
    if (isMeta && key === "g") {
      e.preventDefault()
      const ids = useAppStore.getState().selectedIds
      patchScene(scene, groupElements(scene.getElements(), ids, crypto.randomUUID()))
      return
    }
    if (isMeta && e.shiftKey && key === "l") {
      e.preventDefault()
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      patchScene(scene, lockElements(scene.getElements(), ids))
      useAppStore.getState().setSelection([])
      return
    }
    // Must precede the tool-key dispatch, which is not gated on `!isMeta`:
    // Ctrl+Alt+V would otherwise also switch to the selection tool.
    if (isMeta && e.shiftKey && key === "d") {
      e.preventDefault()
      if (useAppStore.getState().selectedIds.length > 0) {
        useAppStore.getState().setOpenDialog("array-duplicate")
      }
      return
    }
    if (isMeta && !e.shiftKey && !e.altKey && key === "d") {
      e.preventDefault()
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      const copies = duplicateElements(scene.getElements(), ids)
      scene.mutate((draft) => {
        draft.push(...copies)
      })
      useAppStore
        .getState()
        .setSelection(
          copies.filter((c) => !(c.type === "text" && c.containerId !== null)).map((c) => c.id),
        )
      return
    }
    if (isMeta && e.altKey && key === "c") {
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      const el = scene.getElements().find((x) => x.id === ids[0])
      if (!el) return
      e.preventDefault()
      styleClipboard = extractStyle(el)
      return
    }
    if (isMeta && e.altKey && key === "v") {
      const clip = styleClipboard
      if (clip === null) return
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      e.preventDefault()
      const targets = new Set(ids)
      replaceElements(scene, (el) =>
        targets.has(el.id) ? applyPropertiesPatch(el, applyStyle(el, clip)) : undefined,
      )
      return
    }
    if (isMeta && key === "0") {
      e.preventDefault()
      zoomAboutCentre(() => 1)
      return
    }
    if (isMeta && (key === "+" || key === "=")) {
      e.preventDefault()
      zoomAboutCentre((z) => z * 1.1)
      return
    }
    if (isMeta && key === "-") {
      e.preventDefault()
      zoomAboutCentre((z) => z / 1.1)
      return
    }
    if (isMeta && key === "'") {
      e.preventDefault()
      useAppStore.getState().toggleGrid()
      return
    }
    if (isMeta && key === "/") {
      e.preventDefault()
      useAppStore.getState().setPaletteOpen(true)
      return
    }
    if (isMeta && key === "f") {
      e.preventDefault()
      useAppStore.getState().setFindOpen(true)
      return
    }
    if (isMeta && key === "k") {
      e.preventDefault()
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 1) {
        const el = scene.getElements().find((x) => x.id === ids[0])
        if (el && !el.locked) useAppStore.getState().setLinkEditorElementId(el.id)
      }
      return
    }
    if (e.altKey && key === "pagedown") {
      e.preventDefault()
      onNextPage?.()
      return
    }
    if (e.altKey && key === "pageup") {
      e.preventDefault()
      onPrevPage?.()
      return
    }
    if (e.altKey && key === "/") {
      e.preventDefault()
      onToggleStats?.()
      return
    }
    if (key === "escape") {
      const store = useAppStore.getState()
      // Let the active tool cancel/revert its own in-progress gesture (drag,
      // resize, in-progress shape draw, etc.) before the blanket state below.
      store.dispatchToolEvent?.({ type: "escape" })
      if (store.activeTool === "laser") store.setActiveTool("selection")
      // Crop mode owns Escape (revert the drag, or leave crop); keep the image selected.
      if (store.cropElementId === null) store.setSelection([])
      return
    }
    if (key === "?" || (e.shiftKey && key === "/")) {
      useAppStore.getState().setOpenDialog("help")
      return
    }
    if (key === "delete" || key === "backspace") {
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      e.preventDefault()
      deleteElements(scene, ids)
      useAppStore.getState().setSelection([])
      return
    }
    if (isMeta && key === "a") {
      e.preventDefault()
      const all = scene
        .getElements()
        .filter((el) => !el.locked && !(el.type === "text" && el.containerId !== null))
        .map((el) => el.id)
      useAppStore.getState().setSelection(all)
      return
    }
    // Must precede the nudge branch below, which has no isMeta guard.
    const chainDir = isMeta ? CHAIN_DIRECTIONS[key] : undefined
    if (chainDir) {
      const ids = useAppStore.getState().selectedIds
      const source =
        ids.length === 1 ? scene.getElements().find((el) => el.id === ids[0]) : undefined
      const newId = source ? createChainedShape(scene, source, chainDir) : null
      if (newId) {
        e.preventDefault()
        useAppStore.getState().setSelection([newId])
        return
      }
    }
    if (
      !isMeta &&
      (key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright")
    ) {
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0
      const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0
      const moved = new Set(expandIdsToFrameMembers(ids, scene.getElements()))
      replaceElements(scene, (el) =>
        moved.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : undefined,
      )
      return
    }
    // Must precede the tool-key dispatch: Shift+V would otherwise fall through
    // to the selection tool.
    if (!isMeta && e.shiftKey && (key === "h" || key === "v")) {
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      e.preventDefault()
      patchScene(scene, flipElements(scene.getElements(), ids, key === "h" ? "x" : "y"))
      return
    }
    // Must precede the tool-key dispatch: Shift+R would otherwise pick the rectangle.
    if (!isMeta && !e.altKey && e.shiftKey && key === "r") {
      e.preventDefault()
      useAppStore.getState().toggleRulers()
      return
    }
    // Read at keypress time so rebinding applies without re-attaching.
    const tool = toolForKey(key, useAppStore.getState().toolKeyOverrides)
    if (tool) {
      useAppStore.getState().setActiveTool(tool)
    }
  }

  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}
