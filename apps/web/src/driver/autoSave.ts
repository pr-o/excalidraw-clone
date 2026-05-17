"use client"
import { createAutoSaver, saveScene, saveUI, serializeScene } from "@excalidraw-clone/persistence"
import type { Scene } from "@excalidraw-clone/scene"
import { useAppStore } from "../store"

export function startAutoSave(scene: Scene): () => void {
  const saver = createAutoSaver({
    delayMs: 500,
    flush: () => {
      saveScene(serializeScene(scene))
      const s = useAppStore.getState()
      saveUI({
        theme: s.theme,
        locale: s.locale,
        gridEnabled: s.gridEnabled,
        gridSize: s.gridSize,
        canvasBg: s.canvasBg,
        zenMode: s.zenMode,
        activeTool: s.activeTool,
      })
    },
  })

  const unsubScene = scene.subscribe(() => saver.schedule())
  const unsubStore = useAppStore.subscribe(() => saver.schedule())

  const onBeforeUnload = (): void => saver.flushNow()
  window.addEventListener("beforeunload", onBeforeUnload)

  return () => {
    unsubScene()
    unsubStore()
    window.removeEventListener("beforeunload", onBeforeUnload)
    saver.dispose()
  }
}
