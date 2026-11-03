/* eslint-disable react-hooks/exhaustive-deps -- `sceneRevision` is the invalidation key: the Scene mutates in place, so its identity never changes. */
"use client"
import {
  computeStats,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
  type Scene,
  type Stats,
  isBoundLabel,
} from "@excalidraw-clone/scene"
import { useMemo } from "react"
import { useAppStore } from "../store"
import { useSceneRevision } from "./useSceneRevision"

export interface SceneViews {
  selectedIds: readonly string[]
  selectedElements: ExcalidrawElement[]
  /** Bound labels of the selected containers. */
  selectedLabels: ExcalidrawTextElement[]
  layerElements: readonly ExcalidrawElement[]
  historyEntries: ReturnType<Scene["getHistory"]>
  hasLockedElements: boolean
  stats: Stats
  frames: ExcalidrawElement[]
}

/** React-derived views of `scene` for the editor chrome, recomputed on every
 *  scene mutation (the `scene` ref is stable across edits, so without the
 *  revision the panels would only refresh on re-selection). */
export function useSceneViews(scene: Scene): SceneViews {
  const selectedIds = useAppStore((s) => s.selectedIds)
  const sceneRevision = useSceneRevision(scene)
  const selectedElements = useMemo(() => {
    const ids = new Set(selectedIds)
    return scene.getElements().filter((e) => ids.has(e.id))
  }, [selectedIds, scene, sceneRevision])
  const selectedLabels = useMemo(() => {
    const ids = new Set(selectedIds)
    return scene
      .getElements()
      .filter((e): e is ExcalidrawTextElement => isBoundLabel(e) && ids.has(e.containerId))
  }, [selectedIds, scene, sceneRevision])
  const hasLockedElements = useMemo(
    () => scene.getElements().some((e) => e.locked),
    [scene, sceneRevision],
  )
  const layerElements = useMemo(() => scene.getElements(), [scene, sceneRevision])
  const historyEntries = useMemo(() => scene.getHistory(), [scene, sceneRevision])
  const stats = useMemo(
    () => computeStats(selectedElements, layerElements),
    [selectedElements, layerElements],
  )
  const frames = useMemo(
    () => scene.getElements().filter((e) => e.type === "frame" && !e.isDeleted),
    [scene, sceneRevision],
  )
  return {
    selectedIds,
    selectedElements,
    selectedLabels,
    layerElements,
    historyEntries,
    hasLockedElements,
    stats,
    frames,
  }
}
