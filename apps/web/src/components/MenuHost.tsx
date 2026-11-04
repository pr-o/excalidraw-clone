"use client"
import type { ExcalidrawData } from "@excalidraw-clone/scene"
import { HamburgerMenu } from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import i18next from "i18next"
import { notify } from "./LiveAnnouncer"
import { openExcalidrawFromPicker } from "../driver/openFile"
import type { PageRecord } from "../driver/pages"
import { saveAsExcalidraw } from "../driver/saveFile"
import { toggleViewMode } from "../driver/viewMode"
import { useAppStore } from "../store"

export interface MenuHostProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pages: readonly PageRecord[]
  activePageId: string
  canPresent: boolean
  /** Swaps in an opened document (all pages). */
  onOpenDocument: (data: ExcalidrawData) => void
}

/** The hamburger menu wired to the store, file open/save and dialogs. */
export function MenuHost({
  open,
  onOpenChange,
  pages,
  activePageId,
  canPresent,
  onOpenDocument,
}: MenuHostProps): React.ReactElement {
  const { t } = useTranslation()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const canvasBg = useAppStore((s) => s.canvasBg)
  const setCanvasBg = useAppStore((s) => s.setCanvasBg)
  const zenMode = useAppStore((s) => s.zenMode)
  const toggleZenMode = useAppStore((s) => s.toggleZenMode)
  const viewMode = useAppStore((s) => s.viewMode)
  const rulersVisible = useAppStore((s) => s.rulersVisible)
  const toggleRulers = useAppStore((s) => s.toggleRulers)
  const minimapVisible = useAppStore((s) => s.minimapVisible)
  const toggleMinimap = useAppStore((s) => s.toggleMinimap)
  const commentsPanelOpen = useAppStore((s) => s.commentsPanelOpen)
  const toggleCommentsPanel = useAppStore((s) => s.toggleCommentsPanel)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  return (
    <HamburgerMenu
      t={t}
      open={open}
      onOpenChange={onOpenChange}
      theme={theme}
      onThemeChange={setTheme}
      locale={locale}
      onLocaleChange={setLocale}
      canvasBg={canvasBg}
      onCanvasBgChange={setCanvasBg}
      zenMode={zenMode}
      onZenModeToggle={toggleZenMode}
      viewMode={viewMode}
      onViewModeToggle={toggleViewMode}
      rulersVisible={rulersVisible}
      onRulersToggle={toggleRulers}
      minimapVisible={minimapVisible}
      onMinimapToggle={toggleMinimap}
      commentsOpen={commentsPanelOpen}
      onCommentsToggle={toggleCommentsPanel}
      onOpenFile={() => {
        void (async () => {
          try {
            const data = await openExcalidrawFromPicker()
            if (!data) return
            onOpenDocument(data)
          } catch {
            // Corrupt JSON, a newer file version, or a PNG without an embedded scene.
            notify(i18next.t("a11y.openFailed"))
          }
        })()
      }}
      onSaveFile={() => {
        void saveAsExcalidraw(pages, activePageId)
      }}
      onExport={() => setOpenDialog("export")}
      onImportMermaid={() => setOpenDialog("mermaid-import")}
      onExportMermaid={() => setOpenDialog("mermaid-export")}
      onSnapshots={() => setOpenDialog("snapshots")}
      canPresent={canPresent}
      onStartPresentation={() => useAppStore.getState().enterPresentation()}
      onReset={() => setOpenDialog("reset")}
      onHelp={() => setOpenDialog("help")}
      onToolKeys={() => setOpenDialog("tool-keys")}
    />
  )
}
