"use client"
import type { ExcalidrawData, Scene } from "@excalidraw-clone/scene"
import { useEffect, useEffectEvent } from "react"
import { clientToScene } from "../driver/events"
import { handleDroppedFiles } from "../driver/insertFiles"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"

type HandleItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
}

const fileHandleOf = (item: DataTransferItem): Promise<FileSystemHandle | null> => {
  const get = (item as HandleItem).getAsFileSystemHandle
  return get ? get.call(item).catch(() => null) : Promise.resolve(null)
}

const carriesFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes("Files") ?? false

/**
 * Lets files be dropped anywhere on the app: images land where they are dropped,
 * drawings open (after confirming when there is work to replace), libraries import.
 * Dropping elsewhere on the page would otherwise make the browser navigate to the file.
 */
export function useFileDrop({
  scene,
  openDocument,
  hasContent,
}: {
  scene: Scene
  openDocument: (data: ExcalidrawData) => void
  hasContent: () => boolean
}): void {
  const onDrop = useEffectEvent((e: DragEvent) => {
    if (!carriesFiles(e)) return
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length === 0) return
    // Chromium can hand over the dropped file itself, so "Save" writes back to it. The
    // handles must be requested now: the drop's data is cleared once this event ends.
    const handles = Array.from(e.dataTransfer?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => fileHandleOf(item))
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-main-canvas]")
    const view = viewOf(useAppStore.getState())
    const at = canvas
      ? clientToScene(canvas, view, e)
      : { x: e.clientX / view.zoom - view.scrollX, y: e.clientY / view.zoom - view.scrollY }
    void handleDroppedFiles(files, at, { scene, openDocument, hasContent }, handles)
  })

  useEffect(() => {
    const onDragOver = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
    }
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("drop", onDrop)
    }
  }, [])
}
