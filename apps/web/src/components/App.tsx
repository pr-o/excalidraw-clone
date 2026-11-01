"use client"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import { unlockAll } from "@excalidraw-clone/scene"
import { HistoryPanel, Icon, PagesTabBar, StatsPanel, Toolbar } from "@excalidraw-clone/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { cyclePageId } from "../driver/pages"
import { patchScene } from "../driver/patchScene"
import { toggleViewMode } from "../driver/viewMode"
import { useEditorEnvironment, useImageToolUpload } from "../hooks/useEditorEnvironment"
import { usePages } from "../hooks/usePages"
import { useSceneViews } from "../hooks/useSceneViews"
import { ensureI18n } from "../i18n"
import { attachClipboard } from "../keyboard/clipboard"
import { attachShortcuts } from "../keyboard/shortcuts"
import { PresentationHost } from "../presentation/PresentationHost"
import { useAppStore } from "../store"
import { CanvasShell } from "./CanvasShell"
import { CommentsHost } from "./CommentsHost"
import { ContextMenuHost } from "./ContextMenuHost"
import { Dialogs } from "./Dialogs"
import { FindHost } from "./FindHost"
import { LayersHost } from "./LayersHost"
import { LibraryHost, useLibrarySync } from "./LibraryHost"
import { LinkOverlay } from "./LinkOverlay"
import { MenuHost } from "./MenuHost"
import { Minimap } from "./Minimap"
import { PaletteHost } from "./PaletteHost"
import { PropertiesHost } from "./PropertiesHost"
import { SnapshotsHost } from "./SnapshotsHost"
import { TextEditingOverlay } from "./TextEditingOverlay"
import { ZoomWidget } from "./ZoomWidget"

export function App(): React.ReactElement {
  const locale = useAppStore((s) => s.locale)
  const i18n = useMemo(() => ensureI18n(locale), [locale])
  return (
    <I18nextProvider i18n={i18n}>
      <Inner />
    </I18nextProvider>
  )
}

function Inner(): React.ReactElement {
  const { t, i18n } = useTranslation()
  useEditorEnvironment(i18n)
  const doc = usePages()
  const { pages, activePageId, scene, switchToPage } = doc
  // Fullscreen target for presentation mode.
  const rootRef = useRef<HTMLElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [moreShapesOpen, setMoreShapesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [renderer, setRenderer] = useState<CanvasRenderer | null>(null)
  const onRendererReady = useCallback((r: CanvasRenderer): void => setRenderer(r), [])
  const onRendererTeardown = useCallback((): void => setRenderer(null), [])

  useEffect(() => {
    return attachShortcuts({
      scene,
      onNextPage: () => switchToPage(cyclePageId(pages, activePageId, "next")),
      onPrevPage: () => switchToPage(cyclePageId(pages, activePageId, "prev")),
      onToggleStats: () => setStatsOpen((v) => !v),
    })
  }, [scene, pages, activePageId, switchToPage])
  useEffect(() => {
    return attachClipboard({ scene })
  }, [scene])
  useImageToolUpload(renderer)
  useLibrarySync()

  const activeTool = useAppStore((s) => s.activeTool)
  const toolKeyOverrides = useAppStore((s) => s.toolKeyOverrides)
  const setActiveTool = useAppStore((s) => s.setActiveTool)
  const lockActiveTool = useAppStore((s) => s.lockActiveTool)
  const toggleLockActiveTool = useAppStore((s) => s.toggleLockActiveTool)
  const zenMode = useAppStore((s) => s.zenMode)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const presenting = useAppStore((s) => s.presenting)
  const viewMode = useAppStore((s) => s.viewMode)
  const views = useSceneViews(scene)
  const { selectedIds, stats } = views

  return (
    <main ref={rootRef} className="relative h-screen w-screen overflow-hidden">
      <CanvasShell
        scene={scene}
        onRendererReady={onRendererReady}
        onRendererTeardown={onRendererTeardown}
      />

      {!zenMode && !presenting && (
        <>
          <div className="absolute left-3 top-3 z-40">
            <MenuHost
              open={menuOpen}
              onOpenChange={setMenuOpen}
              renderer={renderer}
              pages={pages}
              activePageId={activePageId}
              canPresent={views.frames.length > 0}
              onOpenDocument={doc.loadDocument}
            />
          </div>

          {!viewMode && (
            <>
              {/* Insets clear the menu button and panel toggles; the toolbar wraps its
              tool groups onto a second row when narrower than one row (~940px). */}
              <div className="pointer-events-none absolute left-16 right-16 top-3 z-30 flex justify-center">
                <Toolbar
                  className="pointer-events-auto"
                  t={t}
                  activeTool={activeTool}
                  onSelectTool={setActiveTool}
                  lockActiveTool={lockActiveTool}
                  onToggleLock={() => toggleLockActiveTool()}
                  moreShapesOpen={moreShapesOpen}
                  onMoreShapesOpenChange={setMoreShapesOpen}
                  onOpenStickers={() => setOpenDialog("stickers")}
                  toolKeys={toolKeyOverrides}
                />
              </div>

              {/* Right offset clears the HistoryPanel: its closed toggle occupies
              right:12px–48px, and its open panel occupies right:0–256px. Top offset
              sits below the toolbar (two rows below 960px wide). */}
              <div
                className={`absolute ${historyOpen ? "right-[280px]" : "right-14"} top-[6.75rem] z-30 min-[960px]:top-16`}
              >
                <PropertiesHost
                  scene={scene}
                  selectedIds={selectedIds}
                  selectedElements={views.selectedElements}
                  selectedLabels={views.selectedLabels}
                />
              </div>

              <LayersHost
                scene={scene}
                elements={views.layerElements}
                selectedIds={selectedIds}
                open={layersOpen}
                onToggle={() => setLayersOpen((v) => !v)}
              />

              <LibraryHost
                scene={scene}
                open={libraryOpen}
                onToggle={() => setLibraryOpen((v) => !v)}
              />
            </>
          )}

          <PagesTabBar
            t={t}
            pages={pages}
            activePageId={activePageId}
            thumbnails={doc.thumbnails}
            onSwitch={switchToPage}
            onAdd={doc.addPage}
            onDelete={doc.deletePage}
            onRename={doc.renamePage}
            onDuplicate={doc.duplicatePage}
            onReorder={doc.reorderPage}
            onMove={doc.movePage}
            readOnly={viewMode}
          />

          {!viewMode && (
            <>
              <StatsPanel
                t={t}
                open={statsOpen}
                stats={stats}
                onChange={(patch) => {
                  if (stats.kind !== "single") return
                  const id = stats.id
                  scene.mutate((draft) => {
                    const i = draft.findIndex((e) => e.id === id)
                    if (i >= 0) draft[i] = { ...draft[i]!, ...patch }
                  })
                }}
              />

              <HistoryPanel
                // i18next's TFunction overloads aren't directly assignable to the
                // panel's `(key, options?)` shape under exactOptionalPropertyTypes.
                t={(key, options) => (options ? t(key, options) : t(key))}
                history={views.historyEntries}
                currentIndex={scene.getHistoryIndex()}
                open={historyOpen}
                onToggle={() => setHistoryOpen((v) => !v)}
                onJump={(index) => scene.jumpToHistory(index)}
              />

              {views.hasLockedElements && (
                <button
                  type="button"
                  data-testid="unlock-all"
                  aria-label={t("canvas.unlockAll")}
                  onClick={() => patchScene(scene, unlockAll(scene.getElements()))}
                  className="absolute bottom-16 right-3 z-30 flex items-center gap-1.5 rounded-lg bg-panel px-3 py-2 text-xs shadow-panel hover:bg-panel-hover"
                >
                  <Icon name="unlock" />
                  {t("canvas.unlockAll")}
                </button>
              )}
            </>
          )}

          {/* Sits above the zoom widget and the library toggle; slides left of an open side panel. */}
          <Minimap
            scene={scene}
            className={
              viewMode
                ? "right-3"
                : libraryOpen
                  ? "right-[304px]"
                  : historyOpen
                    ? "right-[272px]"
                    : "right-3"
            }
          />

          <ZoomWidget />
        </>
      )}

      {viewMode && !presenting && (
        <button
          type="button"
          data-testid="view-mode-exit"
          onClick={toggleViewMode}
          className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-panel px-4 py-1.5 text-xs shadow-panel hover:bg-panel-hover"
        >
          {t("viewMode.label")} · {t("viewMode.exit")}
        </button>
      )}

      {presenting && <PresentationHost scene={scene} rootEl={rootRef} />}

      <Dialogs scene={scene} pages={pages} activePageId={activePageId} />
      <PaletteHost scene={scene} />
      <SnapshotsHost
        pages={pages}
        activePageId={activePageId}
        onRestore={(data) => {
          // Fresh Scenes, so undo history resets exactly as when opening a file.
          useAppStore.getState().setSelection([])
          doc.loadDocument(data)
        }}
      />
      <FindHost scene={scene} />
      <ContextMenuHost
        scene={scene}
        pages={pages.filter((p) => p.id !== activePageId).map((p) => ({ id: p.id, name: p.name }))}
        onMoveElementToPage={doc.moveElementToPage}
      />
      <TextEditingOverlay scene={scene} />
      <LinkOverlay scene={scene} />
      <CommentsHost scene={scene} />
    </main>
  )
}
