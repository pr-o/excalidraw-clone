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
      className={`fixed ${position} z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-panel shadow-panel hover:bg-panel-hover`}
    >
      <Icon name={icon} />
    </button>
  )
}

/** Title row of an open side panel, with the button that collapses it. */
export function PanelHeader({
  title,
  toggleLabel,
  testId,
  side,
  onToggle,
  children,
}: {
  title: string
  toggleLabel: string
  testId: string
  /** Which screen edge the panel is docked to; the chevron points there. */
  side: "left" | "right"
  onToggle: () => void
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1 border-b border-panel-subtle py-1.5 pl-3 pr-1.5">
      <span className="flex-1 truncate text-sm font-medium">{title}</span>
      {children}
      <button
        type="button"
        onClick={onToggle}
        aria-label={toggleLabel}
        title={toggleLabel}
        aria-expanded
        data-testid={testId}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel-hover"
      >
        <Icon name={side === "left" ? "chevron-left" : "chevron-right"} />
      </button>
    </div>
  )
}
