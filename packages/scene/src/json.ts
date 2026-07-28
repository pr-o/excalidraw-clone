import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawData,
  ExcalidrawFiles,
  ExcalidrawPage,
} from "./types"

export const SCENE_FORMAT_VERSION = 3 as const
export const SCENE_FORMAT_SOURCE = "https://excalidraw-clone.local"

export const buildExcalidrawData = (
  pages: readonly ExcalidrawPage[],
  activePageId: string,
  appState?: ExcalidrawAppStateSnapshot,
  files?: ExcalidrawFiles,
): ExcalidrawData => ({
  type: "excalidraw",
  version: SCENE_FORMAT_VERSION,
  source: SCENE_FORMAT_SOURCE,
  pages,
  activePageId,
  ...(appState ? { appState } : {}),
  ...(files ? { files } : {}),
})
