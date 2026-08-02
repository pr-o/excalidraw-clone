import type { Point } from "@excalidraw-clone/geometry"
import type { StateCreator } from "zustand"

interface ContextMenuBase {
  x: number
  y: number
  scenePoint: Point
}

export type ContextMenuState =
  | (ContextMenuBase & { target: "canvas" })
  | (ContextMenuBase & { target: "element"; elementIds: string[]; locked: boolean })
  | null

export interface ContextMenuSlice {
  contextMenu: ContextMenuState
  setContextMenu: (s: ContextMenuState) => void
}

export const createContextMenuSlice: StateCreator<ContextMenuSlice, [], [], ContextMenuSlice> = (
  set,
) => ({
  contextMenu: null,
  setContextMenu: (s) => set({ contextMenu: s }),
})
