import { useId, useMemo, useState } from "react"

export interface PaletteCommand {
  id: string
  label: string
  hint?: string
  keywords?: string[]
  perform: () => void
}

export interface CommandPaletteProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  commands: readonly PaletteCommand[]
  className?: string
}

/** Mounted only while open, so every opening starts from an empty query and the
 *  first command highlighted — no effect resetting state on `open`. */
export function CommandPalette({ open, ...props }: CommandPaletteProps): React.ReactElement | null {
  return open ? <PaletteBody {...props} /> : null
}

function PaletteBody({
  t,
  onClose,
  commands,
  className,
}: Omit<CommandPaletteProps, "open">): React.ReactElement {
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState(0)
  const listId = useId()
  const optionId = (id: string): string => `${listId}-${id}`

  const filtered = useMemo(() => {
    if (query.trim() === "") return commands
    const q = query.toLowerCase()
    return commands.filter((c) => {
      if (c.label.toLowerCase().includes(q)) return true
      if (c.keywords?.some((k) => k.toLowerCase().includes(q))) return true
      return false
    })
  }, [commands, query])

  // Derived, not synced: a narrower filter clamps the highlight to the last match.
  const highlight = Math.min(picked, Math.max(0, filtered.length - 1))
  const current = filtered[highlight]

  const run = (command: PaletteCommand | undefined): void => {
    command?.perform()
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setPicked(Math.min(highlight + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setPicked(Math.max(highlight - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      run(current)
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-32 ${className ?? ""}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={t("palette.title")}
        className="w-[480px] rounded-lg bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-label={t("palette.title")}
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={current ? optionId(current.id) : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("palette.placeholder")}
          className="w-full border-b border-panel-subtle px-4 py-3 text-sm outline-none"
        />
        <ul id={listId} role="listbox" className="max-h-80 overflow-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-2 text-sm text-muted">{t("palette.empty")}</li>
          )}
          {filtered.map((c, i) => (
            <li
              key={c.id}
              id={optionId(c.id)}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setPicked(i)}
              onClick={() => run(c)}
              className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${i === highlight ? "bg-accent-soft" : ""}`}
            >
              <span>{c.label}</span>
              {c.hint && <kbd className="font-mono text-xs text-muted">{c.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
