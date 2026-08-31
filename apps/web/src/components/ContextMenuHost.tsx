"use client"
import { fitToContent } from "@excalidraw-clone/geometry"
import {
  bringForward,
  bringToFront,
  duplicateElements,
  type ExcalidrawElement,
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
import { buildPaste, copyPayload } from "../driver/clipboard"
import { canMoveElementToPage } from "../driver/moveToPage"
import { patchScene } from "../driver/patchScene"
import { useAppStore } from "../store"

// Same predicate as apps/web/src/keyboard/clipboard.ts's private selectableIds —
// pasted/duplicated bound text rides along with its container but isn't itself selectable.
const selectableIds = (els: readonly ExcalidrawElement[]): string[] =>
  els.filter((el) => !(el.type === "text" && el.containerId !== null)).map((el) => el.id)

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

  const items: ContextMenuItem[] = []

  if (contextMenu) {
    if (contextMenu.target === "canvas") {
      const { scenePoint } = contextMenu
      items.push({
        id: "paste",
        label: t("contextMenu.paste"),
        perform: () => {
          void navigator.clipboard
            ?.readText()
            .then((text) => {
              const pasted = buildPaste(text, scenePoint)
              if (pasted.length === 0) return
              scene.mutate((draft) => {
                draft.push(...pasted)
              })
              useAppStore.getState().setSelection(selectableIds(pasted))
            })
            .catch(() => {})
        },
      })
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
            const doomed = new Set(payload.ids)
            scene.mutate((draft) => {
              for (let i = 0; i < draft.length; i += 1) {
                if (doomed.has(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
              }
            })
            useAppStore.getState().setSelection([])
          },
        })
        items.push({
          id: "paste",
          label: t("contextMenu.paste"),
          perform: () => {
            void navigator.clipboard
              ?.readText()
              .then((text) => {
                const pasted = buildPaste(text, scenePoint)
                if (pasted.length === 0) return
                scene.mutate((draft) => {
                  draft.push(...pasted)
                })
                useAppStore.getState().setSelection(selectableIds(pasted))
              })
              .catch(() => {})
          },
        })
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
        items.push({
          id: "delete",
          label: t("properties.delete"),
          perform: () => {
            scene.mutate((draft) => {
              for (let i = 0; i < draft.length; i += 1) {
                if (elementIds.includes(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
              }
            })
            useAppStore.getState().setSelection([])
          },
        })
        items.push({
          id: "bring-to-front",
          label: t("properties.bringToFront"),
          perform: () => {
            scene.mutate((draft) => {
              const next = bringToFront(draft, elementIds)
              draft.length = 0
              draft.push(...next)
            })
          },
        })
        items.push({
          id: "bring-forward",
          label: t("properties.bringForward"),
          perform: () => {
            scene.mutate((draft) => {
              const next = bringForward(draft, elementIds)
              draft.length = 0
              draft.push(...next)
            })
          },
        })
        items.push({
          id: "send-backward",
          label: t("properties.sendBackward"),
          perform: () => {
            scene.mutate((draft) => {
              const next = sendBackward(draft, elementIds)
              draft.length = 0
              draft.push(...next)
            })
          },
        })
        items.push({
          id: "send-to-back",
          label: t("properties.sendToBack"),
          perform: () => {
            scene.mutate((draft) => {
              const next = sendToBack(draft, elementIds)
              draft.length = 0
              draft.push(...next)
            })
          },
        })
        if (elementIds.length >= 2) {
          items.push({
            id: "group",
            label: t("properties.group"),
            perform: () => {
              const byId = new Map(
                groupElements(selectedElements, elementIds, crypto.randomUUID()).map((el) => [
                  el.id,
                  el,
                ]),
              )
              if (byId.size === 0) return
              scene.mutate((draft) => {
                for (let i = 0; i < draft.length; i += 1) {
                  const p = byId.get(draft[i]!.id)
                  if (p) draft[i] = p
                }
              })
            },
          })
        }
        if (selectedElements.some((el) => el.groupIds.length > 0)) {
          items.push({
            id: "ungroup",
            label: t("properties.ungroup"),
            perform: () => {
              const byId = new Map(
                ungroupElements(selectedElements, elementIds).map((el) => [el.id, el]),
              )
              if (byId.size === 0) return
              scene.mutate((draft) => {
                for (let i = 0; i < draft.length; i += 1) {
                  const p = byId.get(draft[i]!.id)
                  if (p) draft[i] = p
                }
              })
            },
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
