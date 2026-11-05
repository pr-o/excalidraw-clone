import { useRef, useState } from "react"

/**
 * Inline rename field, mounted when renaming starts. Enter or leaving the field
 * commits a non-blank name (trimmed); Escape cancels. Either way `onDone` ends the edit.
 */
export function RenameInput({
  initial,
  label,
  onRename,
  onDone,
  className,
  testId,
}: {
  initial: string
  /** Accessible name of the field. */
  label: string
  onRename: (name: string) => void
  onDone: () => void
  className?: string
  testId?: string
}): React.ReactElement {
  const [draft, setDraft] = useState(initial)
  // Enter commits and unmounts the field, which can also blur it: finish only once.
  const finished = useRef(false)
  const finish = (commit: boolean): void => {
    if (finished.current) return
    finished.current = true
    const name = draft.trim()
    if (commit && name !== "") onRename(name)
    onDone()
  }
  return (
    <input
      autoFocus
      aria-label={label}
      data-testid={testId}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true)
        if (e.key === "Escape") finish(false)
      }}
      className={className}
    />
  )
}
