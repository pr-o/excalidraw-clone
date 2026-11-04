"use client"
import {
  alignElements,
  distributeElements,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
  type GraphLayoutMode,
  graphEdges,
  layoutGraph,
  resetCrop,
  type Scene,
  straightenConnectors,
  tidyElements,
  isBoundLabel,
} from "@excalidraw-clone/scene"
import { PropertiesPanel } from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { applySelectionPatch, setWholeTextStyle } from "../driver/applyPropertiesPatch"
import { patchScene, replaceElements } from "../driver/patchScene"
import { applyTableOp } from "../driver/tableOps"
import {
  deleteSelection,
  duplicateSelection,
  flipSelection,
  groupSelection,
  lockSelection,
  ungroupSelection,
} from "../driver/selectionActions"
import { useAppStore } from "../store"

export interface PropertiesHostProps {
  scene: Scene
  selectedIds: readonly string[]
  selectedElements: readonly ExcalidrawElement[]
  selectedLabels: readonly ExcalidrawTextElement[]
  onClose?: () => void
}

/** Properties panel wired to scene edits on the current selection. */
export function PropertiesHost({
  scene,
  selectedIds,
  selectedElements,
  selectedLabels,
  onClose,
}: PropertiesHostProps): React.ReactElement {
  const { t } = useTranslation()
  const moveTo = (moved: readonly { id: string; x: number; y: number }[]): void => {
    const byId = new Map(moved.map((p) => [p.id, p]))
    replaceElements(scene, (el) => {
      const p = byId.get(el.id)
      return p && { ...el, x: p.x, y: p.y }
    })
  }
  const canAutoLayout = graphEdges(selectedElements, scene.getElements()).length > 0
  const autoLayout = (mode: GraphLayoutMode): void => {
    const all = scene.getElements()
    const moved = layoutGraph(selectedElements, all, mode)
    if (moved.length === 0) return
    // One history entry: move the nodes and drop stale bends on their connectors.
    const byId = new Map(moved.map((p) => [p.id, p]))
    const straight = new Map(straightenConnectors(all, new Set(byId.keys())).map((a) => [a.id, a]))
    replaceElements(scene, (el) => {
      const p = byId.get(el.id)
      return p ? { ...el, x: p.x, y: p.y } : straight.get(el.id)
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
          selectedIds.includes(el.id) || (isBoundLabel(el) && selectedIds.includes(el.containerId))
            ? setWholeTextStyle(el, style, on)
            : undefined,
        )
      }
      onDelete={() => deleteSelection(scene, selectedIds)}
      onDuplicate={() => duplicateSelection(scene, selectedIds)}
      onAlign={(edge) => moveTo(alignElements(selectedElements, edge))}
      onDistribute={(axis) => moveTo(distributeElements(selectedElements, axis))}
      onTidy={() => moveTo(tidyElements(selectedElements))}
      canAutoLayout={canAutoLayout}
      onAutoLayout={autoLayout}
      onGroup={() => groupSelection(scene, selectedIds)}
      onUngroup={() => ungroupSelection(scene, selectedIds)}
      onLock={() => lockSelection(scene, selectedIds)}
      onFlip={(axis) => flipSelection(scene, selectedIds, axis)}
      onTableAction={(action) => {
        const id = selectedIds[0]
        if (!id) return
        const active = useAppStore.getState().tableActiveCell
        scene.mutate((draft) =>
          applyTableOp(draft, id, action, active?.elementId === id ? active : null),
        )
      }}
      onResetCrop={() => patchScene(scene, resetCrop(scene.getElements(), selectedIds))}
      {...(onClose ? { onClose } : {})}
    />
  )
}
