"use client"
import type { Scene } from "@excalidraw-clone/scene"
import type { ToolName } from "@excalidraw-clone/tools"
import { useAppStore } from "../store"

interface Bindings {
  scene: Scene
}

const TOOL_KEYS: Record<string, ToolName> = {
  v: "selection",
  r: "rectangle",
  o: "ellipse",
  d: "diamond",
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
    const tool = TOOL_KEYS[key]
    if (tool) {
      useAppStore.getState().setActiveTool(tool)
    }
  }

  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}
