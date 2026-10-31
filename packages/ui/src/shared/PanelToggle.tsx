export interface PanelToggleProps {
  label: string
  testId: string
  /** Tailwind placement classes, e.g. "left-3 top-16". */
  position: string
  glyph: string
  onClick: () => void
}

/** The small fixed button a collapsed side panel shows in its place. */
export function PanelToggle({
  label,
  testId,
  position,
  glyph,
  onClick,
}: PanelToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={false}
      data-testid={testId}
      className={`fixed ${position} z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-panel shadow hover:bg-panel-hover`}
    >
      {glyph}
    </button>
  )
}
