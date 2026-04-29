import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawData,
  ExcalidrawElement,
  ExcalidrawFiles,
} from "./types"

export const SCENE_FORMAT_VERSION = 2 as const
export const SCENE_FORMAT_SOURCE = "https://excalidraw-clone.local"

export const buildExcalidrawData = (
  elements: readonly ExcalidrawElement[],
  appState?: ExcalidrawAppStateSnapshot,
  files?: ExcalidrawFiles,
): ExcalidrawData => ({
  type: "excalidraw",
  version: SCENE_FORMAT_VERSION,
  source: SCENE_FORMAT_SOURCE,
  elements,
  ...(appState ? { appState } : {}),
  ...(files ? { files } : {}),
})
