"use client"
import { zoomToPoint } from "@excalidraw-clone/geometry"
import {
  expandIdsToFrameMembers,
  flipElements,
  groupElements,
  lockElements,
  type Scene,
  ungroupElements,
} from "@excalidraw-clone/scene"
import type { ToolName } from "@excalidraw-clone/tools"
import { patchScene } from "../driver/patchScene"
import { useAppStore } from "../store"
import { applyStyle, extractStyle, type StyleClipboard } from "./styleClipboard"

interface Bindings {
  scene: Scene
  onNextPage?: () => void
  onPrevPage?: () => void
}

const TOOL_KEYS: Record<string, ToolName> = {
  v: "selection",
  r: "rectangle",
  o: "ellipse",
  d: "diamond",
  "3": "triangle",
  g: "parallelogram",
  "6": "hexagon",
  "5": "pentagon",
  "8": "octagon",
  l: "line",
  a: "arrow",
  p: "freedraw",
  t: "text",
  "9": "image",
  e: "eraser",
  f: "frame",
  n: "note",
  k: "laser",
}

/** Ephemeral, app-lifetime style clipboard for Cmd/Ctrl+Alt+C / +V. Module-level
 *  rather than closure-level on purpose: `attachShortcuts` is re-invoked on every
 *  page switch and page CRUD, and a copied style must survive those so it can be
 *  pasted onto an element on another page. Never persisted, never cross-tab. */
let styleClipboard: StyleClipboard | null = null

export function attachShortcuts({ scene, onNextPage, onPrevPage }: Bindings): () => void {
  const handler = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return
    }

    const isMeta = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

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
    // Must precede the TOOL_KEYS dispatch, which is not gated on `!isMeta`:
    // Ctrl+Alt+V would otherwise also switch to the selection tool.
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
      scene.mutate((draft) => {
        for (let i = 0; i < draft.length; i += 1) {
          const el = draft[i]!
          if (targets.has(el.id)) draft[i] = applyStyle(el, clip)
        }
      })
      return
    }
    if (isMeta && key === "0") {
      e.preventDefault()
      const s = useAppStore.getState()
      const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      s.setView(zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, 1))
      return
    }
    if (isMeta && (key === "+" || key === "=")) {
      e.preventDefault()
      const s = useAppStore.getState()
      const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      s.setView(
        zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, s.zoom * 1.1),
      )
      return
    }
    if (isMeta && key === "-") {
      e.preventDefault()
      const s = useAppStore.getState()
      const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      s.setView(
        zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, s.zoom / 1.1),
      )
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
    if (key === "escape") {
      const store = useAppStore.getState()
      if (store.activeTool === "laser") store.setActiveTool("selection")
      store.setSelection([])
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
      scene.mutate((draft) => {
        for (let i = 0; i < draft.length; i += 1) {
          if (ids.includes(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
        }
      })
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
    if (key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright") {
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0
      const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0
      const moved = new Set(expandIdsToFrameMembers(ids, scene.getElements()))
      scene.mutate((draft) => {
        for (let i = 0; i < draft.length; i += 1) {
          const el = draft[i]!
          if (moved.has(el.id)) draft[i] = { ...el, x: el.x + dx, y: el.y + dy }
        }
      })
      return
    }
    // Must precede the TOOL_KEYS dispatch: Shift+V would otherwise fall through
    // to the selection tool.
    if (!isMeta && e.shiftKey && (key === "h" || key === "v")) {
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      e.preventDefault()
      patchScene(scene, flipElements(scene.getElements(), ids, key === "h" ? "x" : "y"))
      return
    }
    const tool = TOOL_KEYS[key]
    if (tool) {
      useAppStore.getState().setActiveTool(tool)
    }
  }

  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}
