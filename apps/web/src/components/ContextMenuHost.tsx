"use client"
import { fitToContent } from "@excalidraw-clone/geometry"
import {
  bringForward,
  cellAtLocal,
  toTableLocal,
  TABLE_MAX_TRACKS,
  bringToFront,
  duplicateElements,
  flipElements,
  resetCrop,
  getElementsBounds,
  groupElements,
  lockElements,
  type Scene,
  sendBackward,
  sendToBack,
  ungroupElements,
  unlockElements,
} from "@excalidraw-clone/scene"
import { ContextMenu, type ContextMenuItem, PagePickerFlyout } from "@excalidraw-clone/ui"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { buildPaste, copyPayload, selectableIds } from "../driver/clipboard"
import { commitElementLink } from "../driver/link"
import { canMoveElementToPage } from "../driver/moveToPage"
import { deleteElements, patchScene, reorderElements } from "../driver/patchScene"
import { applyTableOp, type TableOp } from "../driver/tableOps"
import { useAppStore } from "../store"

export interface ContextMenuHostProps {
  scene: Scene
  pages: readonly { id: string; name: string }[]
  onMoveElementToPage: (elementId: string, targetPageId: string) => void
}

export function ContextMenuHost({
  scene,
  pages,
  onMoveElementToPage,
}: ContextMenuHostProps): React.ReactElement | null {
  const { t } = useTranslation()
  const contextMenu = useAppStore((s) => s.contextMenu)
  // Must be referentially stable: ContextMenu keys its window keydown/pointerdown
  // effect on `onClose`, and App re-renders on every store change (Escape also
  // clears the selection via attachShortcuts). A fresh closure per render would
  // tear the Escape listener down mid-dispatch, so it would never fire.
  const close = useCallback((): void => useAppStore.getState().setContextMenu(null), [])
  // Set by the "Move to page" item's perform(). Kept independent of `contextMenu`
  // itself: ContextMenu's onClick always runs perform() then onClose() together,
  // and onClose nulls out the store's contextMenu, so flyout state must live
  // outside it or the flyout would never get a chance to render.
  const [flyout, setFlyout] = useState<{ elementId: string; x: number; y: number } | null>(null)

  const pasteItem = (at: { x: number; y: number }): ContextMenuItem => ({
    id: "paste",
    label: t("contextMenu.paste"),
    perform: () => {
      void navigator.clipboard
        ?.readText()
        .then((text) => {
          const pasted = buildPaste(text, at)
          if (pasted.length === 0) return
          scene.mutate((draft) => {
            draft.push(...pasted)
          })
          useAppStore.getState().setSelection(selectableIds(pasted))
        })
        .catch(() => {})
    },
  })

  const items: ContextMenuItem[] = []

  if (contextMenu) {
    if (contextMenu.target === "canvas") {
      const { scenePoint } = contextMenu
      items.push(pasteItem(scenePoint))
      items.push({
        id: "select-all",
        label: t("contextMenu.selectAll"),
        perform: () => {
          useAppStore
            .getState()
            .setSelection(selectableIds(scene.getElements().filter((el) => !el.locked)))
        },
      })
      const bounds = getElementsBounds(scene.getElements())
      if (bounds) {
        items.push({
          id: "zoom-to-fit",
          label: t("contextMenu.zoomToFit"),
          perform: () => {
            useAppStore
              .getState()
              .setView(fitToContent(bounds, window.innerWidth, window.innerHeight))
          },
        })
      }
    } else {
      const { elementIds, locked, scenePoint } = contextMenu
      const selectedElements = scene.getElements().filter((el) => elementIds.includes(el.id))

      items.push({
        id: "copy",
        label: t("contextMenu.copy"),
        perform: () => {
          const payload = copyPayload(scene.getElements(), elementIds)
          if (payload) void navigator.clipboard?.writeText(payload.text).catch(() => {})
        },
      })

      if (locked) {
        items.push({
          id: "unlock",
          label: t("contextMenu.unlock"),
          perform: () => {
            patchScene(scene, unlockElements(scene.getElements(), elementIds))
            useAppStore.getState().setSelection(elementIds)
          },
        })
      } else {
        items.push({
          id: "cut",
          label: t("contextMenu.cut"),
          perform: () => {
            const payload = copyPayload(scene.getElements(), elementIds)
            if (!payload) return
            void navigator.clipboard?.writeText(payload.text).catch(() => {})
            deleteElements(scene, payload.ids)
            useAppStore.getState().setSelection([])
          },
        })
        items.push(pasteItem(scenePoint))
        items.push({
          id: "duplicate",
          label: t("properties.duplicate"),
          perform: () => {
            const copies = duplicateElements(scene.getElements(), elementIds)
            scene.mutate((draft) => {
              draft.push(...copies)
            })
            useAppStore.getState().setSelection(selectableIds(copies))
          },
        })
        items.push({
          id: "flip-horizontal",
          label: t("properties.flip_horizontal"),
          perform: () => patchScene(scene, flipElements(scene.getElements(), elementIds, "x")),
        })
        items.push({
          id: "flip-vertical",
          label: t("properties.flip_vertical"),
          perform: () => patchScene(scene, flipElements(scene.getElements(), elementIds, "y")),
        })
        if (selectedElements.length === 1 && selectedElements[0]?.type === "frame") {
          items.push({
            id: "export-frame",
            label: t("contextMenu.exportFrame"),
            perform: () => useAppStore.getState().setOpenDialog("export"),
          })
        }
        const tbl = selectedElements.length === 1 ? selectedElements[0] : undefined
        if (tbl?.type === "table") {
          // Target = the cell under the right-click.
          const cell = cellAtLocal(tbl, toTableLocal(tbl, scenePoint))
          const tableItem = (op: TableOp, id: string, key: string): void => {
            items.push({
              id,
              label: t(`contextMenu.${key}`),
              perform: () => scene.mutate((draft) => applyTableOp(draft, tbl.id, op, cell)),
            })
          }
          if (tbl.rows < TABLE_MAX_TRACKS) {
            tableItem("insertRowAbove", "table-insert-row-above", "tableInsertRowAbove")
            tableItem("insertRowBelow", "table-insert-row-below", "tableInsertRowBelow")
          }
          if (tbl.cols < TABLE_MAX_TRACKS) {
            tableItem("insertColLeft", "table-insert-col-left", "tableInsertColLeft")
            tableItem("insertColRight", "table-insert-col-right", "tableInsertColRight")
          }
          if (tbl.rows > 1) tableItem("delRow", "table-delete-row", "tableDeleteRow")
          if (tbl.cols > 1) tableItem("delCol", "table-delete-col", "tableDeleteCol")
        }
        if (resetCrop(scene.getElements(), elementIds).length > 0) {
          items.push({
            id: "reset-crop",
            label: t("properties.reset_crop"),
            perform: () => patchScene(scene, resetCrop(scene.getElements(), elementIds)),
          })
        }
        if (elementIds.length === 1 && pages.length > 0) {
          const el = selectedElements[0]
          if (el && canMoveElementToPage(el, scene.getElements())) {
            items.push({
              id: "move-to-page",
              label: t("contextMenu.moveToPage"),
              perform: () => {
                setFlyout({ elementId: el.id, x: contextMenu.x, y: contextMenu.y })
              },
            })
          }
        }
        if (elementIds.length === 1) {
          const linkEl = selectedElements[0]
          if (linkEl && !linkEl.link) {
            items.push({
              id: "create-link",
              label: t("contextMenu.createLink"),
              perform: () => useAppStore.getState().setLinkEditorElementId(linkEl.id),
            })
          } else if (linkEl) {
            items.push({
              id: "edit-link",
              label: t("contextMenu.editLink"),
              perform: () => useAppStore.getState().setLinkEditorElementId(linkEl.id),
            })
            items.push({
              id: "remove-link",
              label: t("contextMenu.removeLink"),
              perform: () => scene.mutate((draft) => commitElementLink(draft, linkEl.id, null)),
            })
          }
        }
        items.push({
          id: "delete",
          label: t("properties.delete"),
          perform: () => {
            deleteElements(scene, elementIds)
            useAppStore.getState().setSelection([])
          },
        })
        items.push({
          id: "bring-to-front",
          label: t("properties.bringToFront"),
          perform: () => reorderElements(scene, bringToFront, elementIds),
        })
        items.push({
          id: "bring-forward",
          label: t("properties.bringForward"),
          perform: () => reorderElements(scene, bringForward, elementIds),
        })
        items.push({
          id: "send-backward",
          label: t("properties.sendBackward"),
          perform: () => reorderElements(scene, sendBackward, elementIds),
        })
        items.push({
          id: "send-to-back",
          label: t("properties.sendToBack"),
          perform: () => reorderElements(scene, sendToBack, elementIds),
        })
        if (elementIds.length >= 2) {
          items.push({
            id: "group",
            label: t("properties.group"),
            perform: () =>
              patchScene(scene, groupElements(selectedElements, elementIds, crypto.randomUUID())),
          })
        }
        if (selectedElements.some((el) => el.groupIds.length > 0)) {
          items.push({
            id: "ungroup",
            label: t("properties.ungroup"),
            perform: () => patchScene(scene, ungroupElements(selectedElements, elementIds)),
          })
        }
        items.push({
          id: "lock",
          label: t("properties.lock"),
          perform: () => {
            patchScene(scene, lockElements(scene.getElements(), elementIds))
            useAppStore.getState().setSelection([])
          },
        })
      }
    }
  }

  if (!contextMenu && !flyout) return null

  return (
    <>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={items} onClose={close} />
      )}
      {flyout && (
        <PagePickerFlyout
          x={flyout.x}
          y={flyout.y}
          pages={pages}
          onSelect={(targetPageId) => {
            onMoveElementToPage(flyout.elementId, targetPageId)
            setFlyout(null)
          }}
          onClose={() => setFlyout(null)}
        />
      )}
    </>
  )
}
