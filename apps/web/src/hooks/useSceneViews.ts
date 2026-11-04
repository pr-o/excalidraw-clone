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
import { useSceneElements, useSceneSnapshot } from "./useScene"

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

/** React-derived views of `scene` for the editor chrome, recomputed whenever the
 *  scene's elements, its history or the selection change. */
export function useSceneViews(scene: Scene): SceneViews {
  const selectedIds = useAppStore((s) => s.selectedIds)
  const elements = useSceneElements(scene)
  const historyEntries = useSceneSnapshot(scene, (s) => s.getHistory())
  const selectedElements = useMemo(() => {
    const ids = new Set(selectedIds)
    return elements.filter((e) => ids.has(e.id))
  }, [selectedIds, elements])
  const selectedLabels = useMemo(() => {
    const ids = new Set(selectedIds)
    return elements.filter(
      (e): e is ExcalidrawTextElement => isBoundLabel(e) && ids.has(e.containerId),
    )
  }, [selectedIds, elements])
  const hasLockedElements = useMemo(() => elements.some((e) => e.locked), [elements])
  const stats = useMemo(
    () => computeStats(selectedElements, elements),
    [selectedElements, elements],
  )
  const frames = useMemo(() => elements.filter((e) => e.type === "frame"), [elements])
  return {
    selectedIds,
    selectedElements,
    selectedLabels,
    layerElements: elements,
    historyEntries,
    hasLockedElements,
    stats,
    frames,
  }
}
