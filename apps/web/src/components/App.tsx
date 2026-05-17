"use client"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { HamburgerMenu, PropertiesPanel, Toolbar } from "@excalidraw-clone/ui"
import { useEffect, useMemo, useState } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { startAutoSave } from "../driver/autoSave"
import { hydrateScene, hydrateUI } from "../driver/hydration"
import { ensureI18n } from "../i18n"
import { useAppStore } from "../store"
import { CanvasShell } from "./CanvasShell"
import { Dialogs } from "./Dialogs"

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
  const scene = useMemo(() => hydrateScene(), [])
  useEffect(() => {
    hydrateUI()
  }, [])
  useEffect(() => {
    return startAutoSave(scene)
  }, [scene])
  const activeTool = useAppStore((s) => s.activeTool)
  const setActiveTool = useAppStore((s) => s.setActiveTool)
  const lockActiveTool = useAppStore((s) => s.lockActiveTool)
  const toggleLockActiveTool = useAppStore((s) => s.toggleLockActiveTool)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const zenMode = useAppStore((s) => s.zenMode)
  const toggleZenMode = useAppStore((s) => s.toggleZenMode)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme
  }, [theme])

  useEffect(() => {
    void i18n.changeLanguage(locale)
  }, [locale, i18n])

  const selectedElements = useMemo(() => {
    const ids = new Set(selectedIds)
    return scene.getElements().filter((e) => ids.has(e.id))
  }, [selectedIds, scene])

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <CanvasShell scene={scene} />

      {!zenMode && (
        <>
          <div className="absolute left-3 top-3 z-30">
            <HamburgerMenu
              t={t}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              theme={theme}
              onThemeChange={setTheme}
              locale={locale}
              onLocaleChange={setLocale}
              zenMode={zenMode}
              onZenModeToggle={toggleZenMode}
              onOpenFile={() => {
                /* Task 7 */
              }}
              onSaveFile={() => {
                /* Task 7 */
              }}
              onExport={() => setOpenDialog("export")}
              onReset={() => setOpenDialog("reset")}
              onHelp={() => setOpenDialog("help")}
            />
          </div>

          <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2">
            <Toolbar
              t={t}
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              lockActiveTool={lockActiveTool}
              onToggleLock={() => toggleLockActiveTool()}
            />
          </div>

          <div className="absolute right-3 top-3 z-30">
            <PropertiesPanel
              t={t}
              selectedElements={selectedElements}
              onChange={(patch) => {
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    if (selectedIds.includes(draft[i]!.id)) {
                      draft[i] = { ...draft[i]!, ...patch } as ExcalidrawElement
                    }
                  }
                })
              }}
              onDelete={() => {
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    if (selectedIds.includes(draft[i]!.id)) {
                      draft[i] = { ...draft[i]!, isDeleted: true }
                    }
                  }
                })
                useAppStore.getState().setSelection([])
              }}
              onDuplicate={() => {
                /* Task 8 */
              }}
              onSendToBack={() => {
                /* Task 8 */
              }}
              onSendBackward={() => {
                /* Task 8 */
              }}
              onBringForward={() => {
                /* Task 8 */
              }}
              onBringToFront={() => {
                /* Task 8 */
              }}
            />
          </div>
        </>
      )}

      <Dialogs scene={scene} />
    </main>
  )
}
