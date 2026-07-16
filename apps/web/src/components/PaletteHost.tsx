"use client"
import { lockElements, type Scene, unlockAll } from "@excalidraw-clone/scene"
import { CommandPalette, type PaletteCommand } from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { patchScene } from "../driver/patchScene"
import { useAppStore } from "../store"

export function PaletteHost({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useTranslation()
  const open = useAppStore((s) => s.paletteOpen)
  const setOpen = useAppStore((s) => s.setPaletteOpen)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)

  const commands: PaletteCommand[] = [
    { id: "undo", label: t("shortcuts.undo"), hint: "Cmd+Z", perform: () => scene.undo() },
    { id: "redo", label: t("shortcuts.redo"), hint: "Cmd+Shift+Z", perform: () => scene.redo() },
    {
      id: "select-all",
      label: t("shortcuts.selectAll"),
      hint: "Cmd+A",
      perform: () =>
        useAppStore.getState().setSelection(
          scene
            .getElements()
            .filter((e) => !e.locked)
            .map((e) => e.id),
        ),
    },
    {
      id: "deselect",
      label: t("shortcuts.deselect"),
      perform: () => useAppStore.getState().setSelection([]),
    },
    { id: "help", label: t("menu.help"), perform: () => setOpenDialog("help") },
    { id: "export", label: t("menu.export"), perform: () => setOpenDialog("export") },
    { id: "reset", label: t("menu.reset"), perform: () => setOpenDialog("reset") },
    {
      id: "zen",
      label: t("menu.enterZen"),
      perform: () => useAppStore.getState().toggleZenMode(),
    },
    {
      id: "grid",
      label: t("shortcuts.toggleGrid"),
      perform: () => useAppStore.getState().toggleGrid(),
    },
    {
      id: "lock-selection",
      label: t("palette.lockSelection"),
      hint: "Ctrl+Shift+L",
      perform: () => {
        const { selectedIds, setSelection } = useAppStore.getState()
        if (selectedIds.length === 0) return
        patchScene(scene, lockElements(scene.getElements(), selectedIds))
        setSelection([])
      },
    },
    {
      id: "unlock-all",
      label: t("palette.unlockAll"),
      perform: () => patchScene(scene, unlockAll(scene.getElements())),
    },
  ]

  return <CommandPalette t={t} open={open} onClose={() => setOpen(false)} commands={commands} />
}
