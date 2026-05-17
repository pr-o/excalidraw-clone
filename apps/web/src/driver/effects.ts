import type { Scene } from "@excalidraw-clone/scene"
import type { ToolEffect } from "@excalidraw-clone/tools"
import { useAppStore } from "../store"

export function applyEffects(scene: Scene, effects: readonly ToolEffect[]): void {
  for (const eff of effects) {
    switch (eff.kind) {
      case "mutation":
        if (eff.skipHistory) {
          scene.mutate(eff.apply, { skipHistory: true })
        } else {
          scene.mutate(eff.apply)
        }
        break
      case "select":
        useAppStore.getState().setSelection(eff.ids)
        break
      case "addToSelection":
        useAppStore.getState().addToSelection(eff.ids)
        break
      case "removeFromSelection":
        useAppStore.getState().removeFromSelection(eff.ids)
        break
      case "switchTool":
        useAppStore.getState().resetToolState(useAppStore.getState().activeTool)
        useAppStore.getState().setActiveTool(eff.tool)
        break
      case "startTextEdit":
        useAppStore.setState({ textEditElementId: eff.elementId } as never)
        break
    }
  }
}
