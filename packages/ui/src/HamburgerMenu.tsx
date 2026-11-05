import { useEffect, useRef } from "react"
import { colorName } from "./properties/controls"
import { Icon } from "./shared/Icon"
import { useCloseOnEscape } from "./shared/useCloseOnEscape"

export type Theme = "light" | "dark" | "system"
export type Locale = "en" | "ko"

const CANVAS_BG_COLORS = ["#ffffff", "#f8f9fa", "#fff5f5", "#f3f0ff", "#1e1e1e"] as const

export interface HamburgerMenuProps {
  t: (key: string) => string
  open: boolean
  onOpenChange: (open: boolean) => void
  theme: Theme
  onThemeChange: (t: Theme) => void
  locale: Locale
  onLocaleChange: (l: Locale) => void
  canvasBg: string
  onCanvasBgChange: (color: string) => void
  zenMode: boolean
  onZenModeToggle: () => void
  viewMode?: boolean
  onViewModeToggle?: () => void
  rulersVisible?: boolean
  onRulersToggle?: () => void
  measurementsVisible?: boolean
  onMeasurementsToggle?: () => void
  minimapVisible?: boolean
  onMinimapToggle?: () => void
  commentsOpen?: boolean
  onCommentsToggle?: () => void
  onOpenFile: () => void
  /** "Save as…": always asks where to save. */
  onSaveFile: () => void
  /** "Save": writes back to the current file when there is one. Omit to hide the item. */
  onSave?: () => void
  onSnapshots?: () => void
  onExport: () => void
  onImportMermaid: () => void
  onExportMermaid?: () => void
  onStartPresentation: () => void
  canPresent: boolean
  onReset: () => void
  onHelp: () => void
  onToolKeys?: () => void
  className?: string
}

export function HamburgerMenu(props: HamburgerMenuProps): React.ReactElement {
  const close = (): void => props.onOpenChange(false)
  const wrap = (fn: () => void) => () => {
    fn()
    close()
  }

  const { open, onOpenChange } = props
  useCloseOnEscape(open, onOpenChange)
  // Closing unmounts the focused item; hand focus back to the menu button so
  // keyboard users keep their place (a dialog opened from the menu then
  // returns focus here too).
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open) {
      const lost = !document.activeElement || document.activeElement === document.body
      if (lost) triggerRef.current?.focus()
    }
    wasOpen.current = open
  }, [open])

  return (
    <div className={`relative ${props.className ?? ""}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => props.onOpenChange(!props.open)}
        aria-haspopup="menu"
        aria-expanded={props.open}
        aria-label={props.t("menu.label")}
        title={props.t("menu.label")}
        className="flex h-9 w-9 items-center justify-center rounded bg-panel shadow-panel hover:bg-panel-hover pointer-coarse:h-10 pointer-coarse:w-10"
      >
        <Icon name="hamburger" />
      </button>

      {props.open && (
        <div
          role="menu"
          className="absolute left-0 top-11 z-50 max-h-[calc(100vh-4rem)] w-56 overflow-y-auto rounded-xl bg-panel p-1.5 shadow-panel"
        >
          {!props.viewMode && (
            <MenuItem onClick={wrap(props.onOpenFile)}>{props.t("menu.open")}</MenuItem>
          )}
          {props.onSave && (
            <MenuItem onClick={wrap(props.onSave)} testId="menu-save">
              {props.t("menu.save")}
            </MenuItem>
          )}
          <MenuItem onClick={wrap(props.onSaveFile)} testId="menu-save-as">
            {props.t("menu.saveAs")}
          </MenuItem>
          {props.onSnapshots && !props.viewMode && (
            <MenuItem onClick={wrap(props.onSnapshots)}>{props.t("menu.snapshots")}</MenuItem>
          )}
          <MenuItem onClick={wrap(props.onExport)}>{props.t("menu.export")}</MenuItem>
          {props.onExportMermaid && (
            <MenuItem onClick={wrap(props.onExportMermaid)} testId="menu-export-mermaid">
              {props.t("menu.exportMermaid")}
            </MenuItem>
          )}
          {!props.viewMode && (
            <MenuItem onClick={wrap(props.onImportMermaid)} testId="menu-import-mermaid">
              {props.t("menu.importMermaid")}
            </MenuItem>
          )}
          {props.canPresent ? (
            <button
              type="button"
              role="menuitem"
              data-testid="menu-presentation"
              onClick={wrap(props.onStartPresentation)}
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-panel-hover"
            >
              {props.t("menu.presentation")}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              data-testid="menu-presentation"
              disabled
              aria-disabled="true"
              title={props.t("menu.presentationHint")}
              className="block w-full cursor-not-allowed rounded px-3 py-2 text-left text-sm opacity-50"
            >
              {props.t("menu.presentation")}
            </button>
          )}
          <Separator />
          <MenuItem onClick={wrap(props.onZenModeToggle)}>
            {props.zenMode ? props.t("menu.exitZen") : props.t("menu.enterZen")}
          </MenuItem>
          {props.onViewModeToggle && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={props.viewMode ?? false}
              data-testid="menu-view-mode"
              onClick={wrap(props.onViewModeToggle)}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-panel-hover"
            >
              {props.t("menu.viewMode")}
              <span className="text-xs text-muted">{props.viewMode ? "✓" : ""}</span>
            </button>
          )}
          {props.onRulersToggle && !props.viewMode && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={props.rulersVisible ?? false}
              data-testid="menu-rulers"
              onClick={wrap(props.onRulersToggle)}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-panel-hover"
            >
              {props.t("menu.rulers")}
              <span className="text-xs text-muted">{props.rulersVisible ? "✓" : ""}</span>
            </button>
          )}
          {props.onMeasurementsToggle && !props.viewMode && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={props.measurementsVisible ?? false}
              data-testid="menu-measurements"
              onClick={wrap(props.onMeasurementsToggle)}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-panel-hover"
            >
              {props.t("menu.measurements")}
              <span className="text-xs text-muted">{props.measurementsVisible ? "✓" : ""}</span>
            </button>
          )}
          {props.onMinimapToggle && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={props.minimapVisible ?? false}
              data-testid="menu-minimap"
              onClick={wrap(props.onMinimapToggle)}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-panel-hover"
            >
              {props.t("menu.minimap")}
              <span className="text-xs text-muted">{props.minimapVisible ? "✓" : ""}</span>
            </button>
          )}
          {props.onCommentsToggle && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={props.commentsOpen ?? false}
              data-testid="menu-comments"
              onClick={wrap(props.onCommentsToggle)}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-panel-hover"
            >
              {props.t("menu.comments")}
              <span className="text-xs text-muted">{props.commentsOpen ? "✓" : ""}</span>
            </button>
          )}
          <Separator />
          <ChoiceRow
            label={props.t("menu.theme")}
            options={[
              { value: "light", label: props.t("menu.themeLight"), testId: "theme-light" },
              { value: "dark", label: props.t("menu.themeDark"), testId: "theme-dark" },
              { value: "system", label: props.t("menu.themeSystem"), testId: "theme-system" },
            ]}
            value={props.theme}
            onChange={(v) => {
              props.onThemeChange(v)
              close()
            }}
          />
          <ChoiceRow
            label={props.t("menu.language")}
            options={[
              { value: "en", label: "EN", testId: "locale-en" },
              { value: "ko", label: "KO", testId: "locale-ko" },
            ]}
            value={props.locale}
            onChange={(v) => {
              props.onLocaleChange(v)
              close()
            }}
          />
          {!props.viewMode && (
            <div role="group" aria-label={props.t("menu.canvasBg")}>
              <MenuLabel>{props.t("menu.canvasBg")}</MenuLabel>
              <div className="flex gap-1 px-3 py-1">
                {CANVAS_BG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitemradio"
                    data-testid={`canvas-bg-${c.replace("#", "")}`}
                    aria-checked={props.canvasBg === c}
                    aria-label={c}
                    title={colorName(props.t, c)}
                    onClick={() => {
                      props.onCanvasBgChange(c)
                      close()
                    }}
                    className={`h-8 w-8 rounded border-2 ${props.canvasBg === c ? "border-accent" : "border-panel"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}
          <Separator />
          <MenuItem onClick={wrap(props.onHelp)}>{props.t("menu.help")}</MenuItem>
          {props.onToolKeys && (
            <MenuItem onClick={wrap(props.onToolKeys)} testId="menu-tool-keys">
              {props.t("menu.toolKeys")}
            </MenuItem>
          )}
          {!props.viewMode && (
            <MenuItem onClick={wrap(props.onReset)} variant="danger">
              {props.t("menu.reset")}
            </MenuItem>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  variant,
  testId,
  children,
}: {
  onClick: () => void
  variant?: "danger"
  testId?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      onClick={onClick}
      className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${variant === "danger" ? "text-danger hover:bg-danger-soft" : "hover:bg-panel-hover"}`}
    >
      {children}
    </button>
  )
}

/** Visible heading of a menu group; the group itself carries the name. */
function MenuLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div aria-hidden className="mt-2 px-3 py-1 text-xs font-medium text-muted">
      {children}
    </div>
  )
}

function Separator(): React.ReactElement {
  return <div role="separator" className="my-1 h-px bg-panel-active" />
}

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ value: T; label: string; testId: string }>
  value: T
  onChange: (v: T) => void
}): React.ReactElement {
  // A labelled group: a menu may only own menu items, groups and separators.
  return (
    <div role="group" aria-label={label}>
      <MenuLabel>{label}</MenuLabel>
      <div className="flex gap-1 px-3 py-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="menuitemradio"
            data-testid={opt.testId}
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded border px-2 py-1 text-xs ${value === opt.value ? "border-accent bg-accent-soft" : "border-panel"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
