"use client"
import { zoomToPoint } from "@excalidraw-clone/geometry"
import {
  expandIdsToFrameMembers,
  groupElements,
  lockElements,
  type Scene,
  ungroupElements,
} from "@excalidraw-clone/scene"
import type { ToolName } from "@excalidraw-clone/tools"
import { patchScene } from "../driver/patchScene"
import { useAppStore } from "../store"

interface Bindings {
  scene: Scene
}

const TOOL_KEYS: Record<string, ToolName> = {
  v: "selection",
  r: "rectangle",
  o: "ellipse",
  d: "diamond",
  "3": "triangle",
  g: "parallelogram",
  "6": "hexagon",
  l: "line",
  a: "arrow",
  p: "freedraw",
  t: "text",
  "9": "image",
  e: "eraser",
  f: "frame",
  n: "note",
}

export function attachShortcuts({ scene }: Bindings): () => void {
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
    if (key === "escape") {
      useAppStore.getState().setSelection([])
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
    const tool = TOOL_KEYS[key]
    if (tool) {
      useAppStore.getState().setActiveTool(tool)
    }
  }

  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}
