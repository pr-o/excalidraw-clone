import { useEffect } from "react"
import { iconHTML } from "./shared/icons"

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
  onOpenFile: () => void
  onSaveFile: () => void
  onExport: () => void
  onStartPresentation: () => void
  canPresent: boolean
  onReset: () => void
  onHelp: () => void
  className?: string
}

export function HamburgerMenu(props: HamburgerMenuProps): React.ReactElement {
  const close = (): void => props.onOpenChange(false)
  const wrap = (fn: () => void) => () => {
    fn()
    close()
  }

  const { open, onOpenChange } = props
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  return (
    <div className={`relative ${props.className ?? ""}`}>
      <button
        type="button"
        onClick={() => props.onOpenChange(!props.open)}
        aria-haspopup="menu"
        aria-expanded={props.open}
        aria-label={props.t("menu.label")}
        className="flex h-9 w-9 items-center justify-center rounded bg-panel shadow hover:bg-panel-hover"
      >
        <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML("hamburger") }} />
      </button>

      {props.open && (
        <div
          role="menu"
          className="absolute left-0 top-11 z-50 w-56 rounded-lg bg-panel p-2 shadow-lg"
        >
          <MenuItem onClick={wrap(props.onOpenFile)}>{props.t("menu.open")}</MenuItem>
          <MenuItem onClick={wrap(props.onSaveFile)}>{props.t("menu.saveAs")}</MenuItem>
          <MenuItem onClick={wrap(props.onExport)}>{props.t("menu.export")}</MenuItem>
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
          <Separator />
          <MenuLabel>{props.t("menu.theme")}</MenuLabel>
          <ChoiceRow
            options={[
              { value: "light", label: props.t("menu.themeLight"), testId: "theme-light" },
              { value: "dark", label: props.t("menu.themeDark"), testId: "theme-dark" },
              { value: "system", label: props.t("menu.themeSystem"), testId: "theme-system" },
            ]}
            value={props.theme}
            onChange={(v) => {
              props.onThemeChange(v as Theme)
              close()
            }}
          />
          <MenuLabel>{props.t("menu.language")}</MenuLabel>
          <ChoiceRow
            options={[
              { value: "en", label: "EN", testId: "locale-en" },
              { value: "ko", label: "KO", testId: "locale-ko" },
            ]}
            value={props.locale}
            onChange={(v) => {
              props.onLocaleChange(v as Locale)
              close()
            }}
          />
          <MenuLabel>{props.t("menu.canvasBg")}</MenuLabel>
          <div className="flex gap-1 px-3 py-1">
            {CANVAS_BG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                data-testid={`canvas-bg-${c.replace("#", "")}`}
                aria-pressed={props.canvasBg === c}
                aria-label={c}
                onClick={() => {
                  props.onCanvasBgChange(c)
                  close()
                }}
                className={`h-8 w-8 rounded border-2 ${props.canvasBg === c ? "border-accent" : "border-panel"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Separator />
          <MenuItem onClick={wrap(props.onHelp)}>{props.t("menu.help")}</MenuItem>
          <MenuItem onClick={wrap(props.onReset)} variant="danger">
            {props.t("menu.reset")}
          </MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  variant,
  children,
}: {
  onClick: () => void
  variant?: "danger"
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full rounded px-3 py-2 text-left text-sm ${variant === "danger" ? "text-danger hover:bg-danger-soft" : "hover:bg-panel-hover"}`}
    >
      {children}
    </button>
  )
}

function MenuLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="mt-2 px-3 py-1 text-xs font-medium text-muted">{children}</div>
}

function Separator(): React.ReactElement {
  return <div className="my-1 h-px bg-panel-active" aria-hidden />
}

function ChoiceRow({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: string; label: string; testId: string }>
  value: string
  onChange: (v: string) => void
}): React.ReactElement {
  return (
    <div className="flex gap-1 px-3 py-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-testid={opt.testId}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded border px-2 py-1 text-xs ${value === opt.value ? "border-accent bg-accent-soft" : "border-panel"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
