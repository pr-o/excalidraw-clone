"use client"
import {
  alignElements,
  distributeElements,
  duplicateElements,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
  flipElements,
  groupElements,
  lockElements,
  resetCrop,
  type Scene,
  tidyElements,
  ungroupElements,
} from "@excalidraw-clone/scene"
import { PropertiesPanel } from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { applySelectionPatch, setWholeTextStyle } from "../driver/applyPropertiesPatch"
import { deleteElements, patchScene, replaceElements } from "../driver/patchScene"
import { applyTableOp } from "../driver/tableOps"
import { useAppStore } from "../store"

export interface PropertiesHostProps {
  scene: Scene
  selectedIds: readonly string[]
  selectedElements: readonly ExcalidrawElement[]
  selectedLabels: readonly ExcalidrawTextElement[]
}

/** Properties panel wired to scene edits on the current selection. */
export function PropertiesHost({
  scene,
  selectedIds,
  selectedElements,
  selectedLabels,
}: PropertiesHostProps): React.ReactElement {
  const { t } = useTranslation()
  const moveTo = (moved: readonly { id: string; x: number; y: number }[]): void => {
    const byId = new Map(moved.map((p) => [p.id, p]))
    replaceElements(scene, (el) => {
      const p = byId.get(el.id)
      return p && { ...el, x: p.x, y: p.y }
    })
  }
  return (
    <PropertiesPanel
      t={t}
      selectedElements={selectedElements}
      labelElements={selectedLabels}
      onChange={(patch) =>
        replaceElements(scene, (el) => applySelectionPatch(el, patch, selectedIds))
      }
      onSetTextStyle={(style, on) =>
        replaceElements(scene, (el) =>
          selectedIds.includes(el.id) ||
          (el.type === "text" && el.containerId !== null && selectedIds.includes(el.containerId))
            ? setWholeTextStyle(el, style, on)
            : undefined,
        )
      }
      onDelete={() => {
        deleteElements(scene, selectedIds)
        useAppStore.getState().setSelection([])
      }}
      onDuplicate={() => {
        const copies = duplicateElements(scene.getElements(), selectedIds)
        scene.mutate((draft) => {
          draft.push(...copies)
        })
        useAppStore
          .getState()
          .setSelection(
            copies.filter((c) => !(c.type === "text" && c.containerId !== null)).map((c) => c.id),
          )
      }}
      onAlign={(edge) => moveTo(alignElements(selectedElements, edge))}
      onDistribute={(axis) => moveTo(distributeElements(selectedElements, axis))}
      onTidy={() => moveTo(tidyElements(selectedElements))}
      onGroup={() =>
        patchScene(scene, groupElements(selectedElements, selectedIds, crypto.randomUUID()))
      }
      onUngroup={() => patchScene(scene, ungroupElements(selectedElements, selectedIds))}
      onLock={() => {
        patchScene(scene, lockElements(scene.getElements(), selectedIds))
        useAppStore.getState().setSelection([])
      }}
      onFlip={(axis) => {
        patchScene(scene, flipElements(scene.getElements(), selectedIds, axis))
      }}
      onTableAction={(action) => {
        const id = selectedIds[0]
        if (!id) return
        const active = useAppStore.getState().tableActiveCell
        scene.mutate((draft) =>
          applyTableOp(draft, id, action, active?.elementId === id ? active : null),
        )
      }}
      onResetCrop={() => patchScene(scene, resetCrop(scene.getElements(), selectedIds))}
    />
  )
}
