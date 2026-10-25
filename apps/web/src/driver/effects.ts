import type { Point } from "@excalidraw-clone/geometry"
import type { Scene } from "@excalidraw-clone/scene"
import type { ToolEffect } from "@excalidraw-clone/tools"
import { useAppStore } from "../store"
import { reflowFixedWidthText } from "./measureStandaloneText"

export function applyEffects(
  scene: Scene,
  effects: readonly ToolEffect[],
  laser?: { push(at: Point): void },
): void {
  for (const eff of effects) {
    switch (eff.kind) {
      case "mutation": {
        const before = scene.getElementsIncludingDeleted()
        const apply = (draft: Parameters<typeof eff.apply>[0]): void => {
          eff.apply(draft)
          reflowFixedWidthText(before, draft)
        }
        if (eff.skipHistory) {
          scene.mutate(apply, { skipHistory: true })
        } else {
          scene.mutate(apply)
        }
        break
      }
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
        useAppStore.getState().setTextEditElementId(eff.elementId, eff.cell ?? null)
        break
      case "setCrop":
        useAppStore.getState().setCropElementId(eff.elementId)
        break
      case "laserMove":
        laser?.push(eff.at)
        break
      case "placeComment":
        useAppStore.getState().setCommentDraft(eff.anchor)
        break
      case "setGuides":
        useAppStore.getState().setActiveGuides(eff.guides)
        break
    }
  }
}
