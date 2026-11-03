"use client"
import type { Scene } from "@excalidraw-clone/scene"
import { ContextMenu, PagePickerFlyout } from "@excalidraw-clone/ui"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../store"
import { canvasMenuItems, elementMenuItems } from "./contextMenuItems"

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

  const env = {
    scene,
    t,
    pageCount: pages.length,
    openMovePicker: (elementId: string): void => {
      if (contextMenu) setFlyout({ elementId, x: contextMenu.x, y: contextMenu.y })
    },
  }
  const items = !contextMenu
    ? []
    : contextMenu.target === "canvas"
      ? canvasMenuItems(env, contextMenu.scenePoint)
      : elementMenuItems(env, contextMenu)

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
