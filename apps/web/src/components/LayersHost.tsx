"use client"
import {
  bringForward,
  bringToFront,
  type ExcalidrawElement,
  expandIdsToGroups,
  type Scene,
  sendBackward,
  sendToBack,
} from "@excalidraw-clone/scene"
import { LayersPanel } from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { reorderElements } from "../driver/patchScene"
import { useAppStore } from "../store"

export interface LayersHostProps {
  scene: Scene
  elements: readonly ExcalidrawElement[]
  selectedIds: readonly string[]
  open: boolean
  onToggle: () => void
}

/** Layers panel: click-to-select (group-expanded) and z-order buttons. */
export function LayersHost({
  scene,
  elements,
  selectedIds,
  open,
  onToggle,
}: LayersHostProps): React.ReactElement {
  const { t } = useTranslation()
  const reorder = (fn: Parameters<typeof reorderElements>[1]) => (id: string) =>
    reorderElements(scene, fn, [id])
  return (
    <LayersPanel
      t={t}
      elements={elements}
      selectedIds={selectedIds}
      open={open}
      onToggle={onToggle}
      onSelect={(id, opts) => {
        const hitIds = expandIdsToGroups([id], scene.getElements())
        if (opts.additive) {
          if (!selectedIds.includes(id)) useAppStore.getState().addToSelection(hitIds)
        } else {
          useAppStore.getState().setSelection(hitIds)
        }
      }}
      onSendToBack={reorder(sendToBack)}
      onSendBackward={reorder(sendBackward)}
      onBringForward={reorder(bringForward)}
      onBringToFront={reorder(bringToFront)}
    />
  )
}
