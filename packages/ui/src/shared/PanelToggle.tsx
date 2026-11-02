import { Icon } from "./Icon"

export interface PanelToggleProps {
  label: string
  testId: string
  /** Tailwind placement classes, e.g. "left-3 top-16". */
  position: string
  /** Icon name from icons.ts identifying the panel. */
  icon: string
  onClick: () => void
}

/** The small fixed button a collapsed side panel shows in its place. */
export function PanelToggle({
  label,
  testId,
  position,
  icon,
  onClick,
}: PanelToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={false}
      data-testid={testId}
      className={`fixed ${position} z-30 flex h-9 w-9 items-center pointer-coarse:h-10 pointer-coarse:w-10 justify-center rounded-lg bg-panel shadow-panel hover:bg-panel-hover`}
    >
      <Icon name={icon} />
    </button>
  )
}

/** The other panel docked to the same edge: shown in the open panel's header so
 *  one click swaps panels (they are exclusive, so its floating toggle is hidden). */
export interface PanelSibling {
  label: string
  testId: string
  icon: string
  onClick: () => void
}

/** Icon pair in an open panel's header: this panel (highlighted) and its same-edge sibling. */
function PanelSwitch({
  icon,
  sibling,
}: {
  icon: string
  sibling: PanelSibling
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-panel-hover p-0.5">
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-white"
      >
        <Icon name={icon} />
      </span>
      <button
        type="button"
        onClick={sibling.onClick}
        aria-label={sibling.label}
        title={sibling.label}
        aria-expanded={false}
        data-testid={sibling.testId}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-panel-active hover:text-app"
      >
        <Icon name={sibling.icon} />
      </button>
    </div>
  )
}

/** Title row of an open side panel, with the button that collapses it. */
export function PanelHeader({
  title,
  toggleLabel,
  testId,
  side,
  onToggle,
  icon,
  sibling,
  children,
}: {
  title: string
  toggleLabel: string
  testId: string
  /** Which screen edge the panel is docked to; the chevron points there. */
  side: "left" | "right"
  onToggle: () => void
  /** This panel's icon, shown highlighted next to `sibling`. */
  icon?: string
  sibling?: PanelSibling | undefined
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1 border-b border-panel-subtle py-1.5 pl-3 pr-1.5">
      <span className="flex-1 truncate text-sm font-medium">{title}</span>
      {children}
      {sibling && icon && <PanelSwitch icon={icon} sibling={sibling} />}
      <button
        type="button"
        onClick={onToggle}
        aria-label={toggleLabel}
        title={toggleLabel}
        aria-expanded
        data-testid={testId}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel-hover pointer-coarse:h-10 pointer-coarse:w-10"
      >
        <Icon name={side === "left" ? "chevron-left" : "chevron-right"} />
      </button>
    </div>
  )
}
