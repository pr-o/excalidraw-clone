"use client"
import type { ExcalidrawData, Scene } from "@excalidraw-clone/scene"
import { useEffect, useEffectEvent } from "react"
import { clientToScene } from "../driver/events"
import { handleDroppedFiles } from "../driver/insertFiles"
import { useAppStore } from "../store"
import { viewOf } from "../store/slices/view"

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
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-main-canvas]")
    const view = viewOf(useAppStore.getState())
    const at = canvas
      ? clientToScene(canvas, view, e)
      : { x: e.clientX / view.zoom - view.scrollX, y: e.clientY / view.zoom - view.scrollY }
    void handleDroppedFiles(files, at, { scene, openDocument, hasContent })
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
