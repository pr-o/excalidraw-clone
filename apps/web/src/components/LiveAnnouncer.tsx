"use client"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../store"

const listeners = new Set<(text: string) => void>()

/** Speak `text` through the editor's polite live region (screen readers only). */
export function announce(text: string): void {
  for (const fn of listeners) fn(text)
}

/** Visually hidden aria-live region: announces tool changes and anything passed
 *  to `announce` (undo/redo, keyboard element navigation). */
export function LiveAnnouncer(): React.ReactElement {
  const { t } = useTranslation()
  const [message, setMessage] = useState({ text: "", n: 0 })

  useEffect(() => {
    // A repeated message must still be re-read: the counter flips a trailing
    // non-breaking space so the DOM text always changes.
    const say = (text: string): void => setMessage((m) => ({ text, n: m.n + 1 }))
    listeners.add(say)
    const unsub = useAppStore.subscribe((s, prev) => {
      if (s.activeTool !== prev.activeTool) {
        say(t("a11y.toolSelected", { tool: t(`toolbar.${s.activeTool}`) }))
      }
    })
    return () => {
      listeners.delete(say)
      unsub()
    }
  }, [t])

  return (
    <div role="status" aria-live="polite" data-testid="live-announcer" className="sr-only">
      {message.text}
      {message.n % 2 === 1 ? " " : ""}
    </div>
  )
}
