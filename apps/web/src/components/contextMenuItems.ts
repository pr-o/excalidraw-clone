import { fitToContent } from "@excalidraw-clone/geometry"
import {
  bringForward,
  bringToFront,
  cellAtLocal,
  getElementsBounds,
  resetCrop,
  sendBackward,
  sendToBack,
  TABLE_MAX_TRACKS,
  toTableLocal,
  unlockElements,
  type ExcalidrawElement,
  type ExcalidrawTableElement,
  type Scene,
} from "@excalidraw-clone/scene"
import type { ContextMenuItem } from "@excalidraw-clone/ui"
import { buildPaste, copyPayload, selectableIds } from "../driver/clipboard"
import { commitElementLink } from "../driver/link"
import { canMoveElementToPage } from "../driver/moveToPage"
import { deleteElements, patchScene, reorderElements } from "../driver/patchScene"
import {
  deleteSelection,
  duplicateSelection,
  flipSelection,
  groupSelection,
  lockSelection,
  ungroupSelection,
} from "../driver/selectionActions"
import { applyTableOp, type TableOp } from "../driver/tableOps"
import { useAppStore } from "../store"

/** What the item builders need from the host component. */
export interface MenuEnv {
  scene: Scene
  t: (key: string) => string
  /** Number of pages the element could be moved to. */
  pageCount: number
  /** Opens the "move to page" picker for an element at the menu's position. */
  openMovePicker: (elementId: string) => void
}

type Point = { x: number; y: number }

const item = (id: string, label: string, perform: () => void): ContextMenuItem => ({
  id,
  label,
  perform,
})

const writeClipboard = (text: string): void => {
  void navigator.clipboard?.writeText(text).catch(() => {})
}

const pasteItem = ({ scene, t }: MenuEnv, at: Point): ContextMenuItem =>
  item("paste", t("contextMenu.paste"), () => {
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
  })

/** Menu for a right-click on empty canvas. */
export function canvasMenuItems(env: MenuEnv, scenePoint: Point): ContextMenuItem[] {
  const { scene, t } = env
  const items = [
    pasteItem(env, scenePoint),
    item("select-all", t("contextMenu.selectAll"), () =>
      useAppStore
        .getState()
        .setSelection(selectableIds(scene.getElements().filter((el) => !el.locked))),
    ),
  ]
  const bounds = getElementsBounds(scene.getElements())
  if (bounds) {
    items.push(
      item("zoom-to-fit", t("contextMenu.zoomToFit"), () =>
        useAppStore.getState().setView(fitToContent(bounds, window.innerWidth, window.innerHeight)),
      ),
    )
  }
  return items
}

/** Row/column operations for a right-clicked table, targeting the cell under the pointer. */
function tableItems(
  { scene, t }: MenuEnv,
  table: ExcalidrawTableElement,
  scenePoint: Point,
): ContextMenuItem[] {
  const cell = cellAtLocal(table, toTableLocal(table, scenePoint))
  const op = (operation: TableOp, id: string, key: string): ContextMenuItem =>
    item(id, t(`contextMenu.${key}`), () =>
      scene.mutate((draft) => applyTableOp(draft, table.id, operation, cell)),
    )
  const items: ContextMenuItem[] = []
  if (table.rows < TABLE_MAX_TRACKS) {
    items.push(
      op("insertRowAbove", "table-insert-row-above", "tableInsertRowAbove"),
      op("insertRowBelow", "table-insert-row-below", "tableInsertRowBelow"),
    )
  }
  if (table.cols < TABLE_MAX_TRACKS) {
    items.push(
      op("insertColLeft", "table-insert-col-left", "tableInsertColLeft"),
      op("insertColRight", "table-insert-col-right", "tableInsertColRight"),
    )
  }
  if (table.rows > 1) items.push(op("delRow", "table-delete-row", "tableDeleteRow"))
  if (table.cols > 1) items.push(op("delCol", "table-delete-col", "tableDeleteCol"))
  return items
}

/** Create / edit / remove the element link (single selection only). */
function linkItems({ scene, t }: MenuEnv, el: ExcalidrawElement): ContextMenuItem[] {
  const edit = (): void => useAppStore.getState().setLinkEditorElementId(el.id)
  if (!el.link) return [item("create-link", t("contextMenu.createLink"), edit)]
  return [
    item("edit-link", t("contextMenu.editLink"), edit),
    item("remove-link", t("contextMenu.removeLink"), () =>
      scene.mutate((draft) => commitElementLink(draft, el.id, null)),
    ),
  ]
}

/** Menu for a right-click on `elementIds` (the whole multi-selection when it hit a selected one). */
export function elementMenuItems(
  env: MenuEnv,
  target: { elementIds: string[]; locked: boolean; scenePoint: Point },
): ContextMenuItem[] {
  const { scene, t } = env
  const { elementIds, locked, scenePoint } = target
  const selected = scene.getElements().filter((el) => elementIds.includes(el.id))
  const only = selected.length === 1 ? selected[0] : undefined

  const copy = item("copy", t("contextMenu.copy"), () => {
    const payload = copyPayload(scene.getElements(), elementIds)
    if (payload) writeClipboard(payload.text)
  })
  if (locked) {
    return [
      copy,
      item("unlock", t("contextMenu.unlock"), () => {
        patchScene(scene, unlockElements(scene.getElements(), elementIds))
        useAppStore.getState().setSelection(elementIds)
      }),
    ]
  }

  const items: ContextMenuItem[] = [
    copy,
    item("cut", t("contextMenu.cut"), () => {
      const payload = copyPayload(scene.getElements(), elementIds)
      if (!payload) return
      writeClipboard(payload.text)
      deleteElements(scene, payload.ids)
      useAppStore.getState().setSelection([])
    }),
    pasteItem(env, scenePoint),
    item("duplicate", t("properties.duplicate"), () => duplicateSelection(scene, elementIds)),
    item("array-duplicate", t("arrayDuplicate.action"), () => {
      // The dialog acts on the store selection, so make it match the menu's target.
      useAppStore.getState().setSelection(elementIds)
      useAppStore.getState().setOpenDialog("array-duplicate")
    }),
    item("flip-horizontal", t("properties.flip_horizontal"), () =>
      flipSelection(scene, elementIds, "x"),
    ),
    item("flip-vertical", t("properties.flip_vertical"), () =>
      flipSelection(scene, elementIds, "y"),
    ),
  ]

  if (only?.type === "frame") {
    items.push(
      item("export-frame", t("contextMenu.exportFrame"), () =>
        useAppStore.getState().setOpenDialog("export"),
      ),
    )
  }
  if (only?.type === "table") items.push(...tableItems(env, only, scenePoint))
  if (resetCrop(scene.getElements(), elementIds).length > 0) {
    items.push(
      item("reset-crop", t("properties.reset_crop"), () =>
        patchScene(scene, resetCrop(scene.getElements(), elementIds)),
      ),
    )
  }
  if (only && env.pageCount > 0 && canMoveElementToPage(only, scene.getElements())) {
    items.push(item("move-to-page", t("contextMenu.moveToPage"), () => env.openMovePicker(only.id)))
  }
  if (only) items.push(...linkItems(env, only))

  items.push(
    item("delete", t("properties.delete"), () => deleteSelection(scene, elementIds)),
    item("bring-to-front", t("properties.bringToFront"), () =>
      reorderElements(scene, bringToFront, elementIds),
    ),
    item("bring-forward", t("properties.bringForward"), () =>
      reorderElements(scene, bringForward, elementIds),
    ),
    item("send-backward", t("properties.sendBackward"), () =>
      reorderElements(scene, sendBackward, elementIds),
    ),
    item("send-to-back", t("properties.sendToBack"), () =>
      reorderElements(scene, sendToBack, elementIds),
    ),
  )
  if (elementIds.length >= 2) {
    items.push(item("group", t("properties.group"), () => groupSelection(scene, elementIds)))
  }
  if (selected.some((el) => el.groupIds.length > 0)) {
    items.push(item("ungroup", t("properties.ungroup"), () => ungroupSelection(scene, elementIds)))
  }
  items.push(item("lock", t("properties.lock"), () => lockSelection(scene, elementIds)))
  return items
}
