import { useEffect, useRef } from "react"

export interface FindOverlayProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  query: string
  onQueryChange: (q: string) => void
  /** 1-based position of the current match; 0 when `matchCount` is 0. */
  matchIndex: number
  matchCount: number
  onNext: () => void
  onPrev: () => void
  className?: string
}

export function FindOverlay({
  t,
  open,
  onClose,
  query,
  onQueryChange,
  matchIndex,
  matchCount,
  onNext,
  onPrev,
  className,
}: FindOverlayProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      queueMicrotask(() => inputRef.current?.focus())
    }
  }, [open])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault()
      onPrev()
    } else if (e.key === "Enter") {
      e.preventDefault()
      onNext()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  const disabled = matchCount === 0

  return (
    <div
      role="dialog"
      aria-label={t("find.title")}
      data-testid="find-overlay"
      className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg bg-panel px-2 py-1.5 shadow-lg ${className ?? ""}`}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t("find.placeholder")}
        data-testid="find-input"
        className="w-48 bg-transparent px-2 py-1 text-sm outline-none"
      />
      <span
        data-testid="find-counter"
        className="whitespace-nowrap text-xs tabular-nums text-muted"
      >
        {`${disabled ? 0 : matchIndex} of ${matchCount}`}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled}
        aria-label={t("find.prev")}
        data-testid="find-prev"
        className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-panel-hover disabled:opacity-40 disabled:hover:bg-transparent"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        aria-label={t("find.next")}
        data-testid="find-next"
        className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-panel-hover disabled:opacity-40 disabled:hover:bg-transparent"
      >
        ›
      </button>
    </div>
  )
}
