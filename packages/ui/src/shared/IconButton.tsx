export interface IconButtonProps {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  shortcut?: string
  "data-testid"?: string
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
      data-testid={rest["data-testid"]}
      className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
        active ? "bg-violet-600 text-white" : "hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  )
}
