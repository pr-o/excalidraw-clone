"use client"
import { lockElements, type Scene, unlockAll } from "@excalidraw-clone/scene"
import { CommandPalette, type PaletteCommand } from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { patchScene } from "../driver/patchScene"
import { toggleViewMode } from "../driver/viewMode"
import { useAppStore } from "../store"

export function PaletteHost({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useTranslation()
  const open = useAppStore((s) => s.paletteOpen)
  const setOpen = useAppStore((s) => s.setPaletteOpen)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)

  const viewMode = useAppStore((s) => s.viewMode)

  const allCommands: PaletteCommand[] = [
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
    { id: "tool-keys", label: t("menu.toolKeys"), perform: () => setOpenDialog("tool-keys") },
    { id: "export", label: t("menu.export"), perform: () => setOpenDialog("export") },
    {
      id: "import-mermaid",
      label: t("menu.importMermaid"),
      perform: () => setOpenDialog("mermaid-import"),
    },
    {
      id: "export-mermaid",
      label: t("menu.exportMermaid"),
      perform: () => setOpenDialog("mermaid-export"),
    },
    {
      id: "stickers",
      label: t("toolbar.stickers"),
      perform: () => setOpenDialog("stickers"),
    },
    { id: "reset", label: t("menu.reset"), perform: () => setOpenDialog("reset") },
    { id: "snapshots", label: t("menu.snapshots"), perform: () => setOpenDialog("snapshots") },
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
      id: "rulers",
      label: t("menu.rulers"),
      hint: "Shift+R",
      perform: () => useAppStore.getState().toggleRulers(),
    },
    {
      id: "minimap",
      label: t("palette.toggleMinimap"),
      hint: "Alt+M",
      perform: () => useAppStore.getState().toggleMinimap(),
    },
    {
      id: "view-mode",
      label: t("menu.viewMode"),
      hint: "Alt+R",
      perform: toggleViewMode,
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
      id: "array-duplicate",
      label: t("arrayDuplicate.action"),
      hint: "Ctrl+Shift+D",
      perform: () => {
        if (useAppStore.getState().selectedIds.length > 0) setOpenDialog("array-duplicate")
      },
    },
    {
      id: "unlock-all",
      label: t("palette.unlockAll"),
      perform: () => patchScene(scene, unlockAll(scene.getElements())),
    },
  ]

  // View mode is read-only: keep only the commands that cannot touch the scene.
  const commands = viewMode
    ? allCommands.filter((c) => ["help", "export", "export-mermaid", "view-mode"].includes(c.id))
    : allCommands

  return <CommandPalette t={t} open={open} onClose={() => setOpen(false)} commands={commands} />
}
