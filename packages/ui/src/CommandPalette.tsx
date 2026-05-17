import { useEffect, useMemo, useRef, useState } from "react"

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

export function CommandPalette({
  t,
  open,
  onClose,
  commands,
  className,
}: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setHighlight(0)
      queueMicrotask(() => inputRef.current?.focus())
    }
  }, [open])

  const filtered = useMemo(() => {
    if (query.trim() === "") return commands
    const q = query.toLowerCase()
    return commands.filter((c) => {
      if (c.label.toLowerCase().includes(q)) return true
      if (c.keywords?.some((k) => k.toLowerCase().includes(q))) return true
      return false
    })
  }, [commands, query])

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(Math.max(0, filtered.length - 1))
  }, [filtered.length, highlight])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      filtered[highlight]?.perform()
      onClose()
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
        className="w-[480px] rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("palette.placeholder")}
          className="w-full border-b border-gray-200 px-4 py-3 text-sm outline-none"
        />
        <ul role="listbox" className="max-h-80 overflow-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-2 text-sm text-gray-500">{t("palette.empty")}</li>
          )}
          {filtered.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                c.perform()
                onClose()
              }}
              className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${i === highlight ? "bg-violet-100" : ""}`}
            >
              <span>{c.label}</span>
              {c.hint && <kbd className="font-mono text-xs text-gray-500">{c.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
