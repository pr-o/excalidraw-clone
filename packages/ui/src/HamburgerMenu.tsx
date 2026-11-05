import { useEffect, useRef } from "react"
import { colorName } from "./properties/controls"
import { Icon } from "./shared/Icon"
import { useDismiss } from "./shared/useDismiss"

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
  // View toggles; rulers and measurements are editing aids, so view mode hides them.
  const editing = !props.viewMode
  const toggles = [
    {
      onToggle: props.onViewModeToggle,
      checked: props.viewMode,
      testId: "menu-view-mode",
      label: "menu.viewMode",
    },
    {
      onToggle: editing ? props.onRulersToggle : undefined,
      checked: props.rulersVisible,
      testId: "menu-rulers",
      label: "menu.rulers",
    },
    {
      onToggle: editing ? props.onMeasurementsToggle : undefined,
      checked: props.measurementsVisible,
      testId: "menu-measurements",
      label: "menu.measurements",
    },
    {
      onToggle: props.onMinimapToggle,
      checked: props.minimapVisible,
      testId: "menu-minimap",
      label: "menu.minimap",
    },
    {
      onToggle: props.onCommentsToggle,
      checked: props.commentsOpen,
      testId: "menu-comments",
      label: "menu.comments",
    },
  ]
  const containerRef = useRef<HTMLDivElement>(null)
  useDismiss(open, onOpenChange, containerRef)
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
    <div ref={containerRef} className={`relative ${props.className ?? ""}`}>
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
          <MenuItem
            onClick={wrap(props.onStartPresentation)}
            testId="menu-presentation"
            disabledHint={props.canPresent ? undefined : props.t("menu.presentationHint")}
          >
            {props.t("menu.presentation")}
          </MenuItem>
          <Separator />
          <MenuItem onClick={wrap(props.onZenModeToggle)}>
            {props.zenMode ? props.t("menu.exitZen") : props.t("menu.enterZen")}
          </MenuItem>
          {toggles.map(
            (t) =>
              t.onToggle && (
                <MenuCheckItem
                  key={t.testId}
                  checked={t.checked ?? false}
                  onClick={wrap(t.onToggle)}
                  testId={t.testId}
                >
                  {props.t(t.label)}
                </MenuCheckItem>
              ),
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

const ITEM_CLASS = "w-full rounded-md px-3 py-1.5 text-left text-sm"

function MenuItem({
  onClick,
  variant,
  testId,
  disabledHint,
  children,
}: {
  onClick: () => void
  variant?: "danger"
  testId?: string
  /** Set when the item is unavailable: shown as its tooltip, explaining why. */
  disabledHint?: string | undefined
  children: React.ReactNode
}): React.ReactElement {
  const disabled = disabledHint !== undefined
  const tone = disabled
    ? "cursor-not-allowed opacity-50"
    : variant === "danger"
      ? "text-danger hover:bg-danger-soft"
      : "hover:bg-panel-hover"
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      title={disabledHint}
      className={`block ${ITEM_CLASS} ${tone}`}
    >
      {children}
    </button>
  )
}

/** A menu toggle: its state is announced as checked and shown with a tick. */
function MenuCheckItem({
  checked,
  onClick,
  testId,
  children,
}: {
  checked: boolean
  onClick: () => void
  testId: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      data-testid={testId}
      onClick={onClick}
      className={`flex items-center justify-between ${ITEM_CLASS} hover:bg-panel-hover`}
    >
      {children}
      <span className="text-xs text-muted">{checked ? "✓" : ""}</span>
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
