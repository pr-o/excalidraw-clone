"use client"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../store"

const listeners = new Set<(text: string) => void>()
const noticeListeners = new Set<(text: string) => void>()

/** Speak `text` through the editor's polite live region (screen readers only). */
export function announce(text: string): void {
  for (const fn of listeners) fn(text)
}

/** Tell everyone something went wrong that they would otherwise never see:
 *  speaks `text` and also shows it as a short-lived on-screen notice. */
export function notify(text: string): void {
  announce(text)
  for (const fn of noticeListeners) fn(text)
}

/** How long an on-screen notice stays up. */
const NOTICE_MS = 7000

/** The visible half of `notify`: a dismissible pill that fades after a few seconds. */
export function NoticeToast(): React.ReactElement | null {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = (text: string): void => {
      setNotice(text)
      clearTimeout(timer)
      timer = setTimeout(() => setNotice(null), NOTICE_MS)
    }
    noticeListeners.add(show)
    return () => {
      noticeListeners.delete(show)
      clearTimeout(timer)
    }
  }, [])
  if (notice === null) return null
  return (
    <div
      data-testid="notice-toast"
      className="absolute bottom-4 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-lg bg-panel px-4 py-2 text-sm shadow-panel"
    >
      <span>{notice}</span>
      <button
        type="button"
        aria-label={t("a11y.dismissNotice")}
        onClick={() => setNotice(null)}
        className="rounded px-1 text-muted hover:bg-panel-hover"
      >
        ×
      </button>
    </div>
  )
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
