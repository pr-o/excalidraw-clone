export interface IconButtonProps {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  shortcut?: string
  "data-testid"?: string
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"]
  "aria-expanded"?: boolean
}

export function IconButton({
  label,
  active,
  onClick,
  children,
  shortcut,
  ...rest
}: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      aria-haspopup={rest["aria-haspopup"]}
      aria-expanded={rest["aria-expanded"]}
      data-testid={rest["data-testid"]}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors pointer-coarse:h-10 pointer-coarse:w-10 ${
        active ? "bg-accent text-white" : "hover:bg-panel-hover"
      }`}
    >
      {children}
    </button>
  )
}
