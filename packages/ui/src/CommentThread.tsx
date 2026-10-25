import type { Comment } from "@excalidraw-clone/scene"
import { useState } from "react"

export interface CommentComposerProps {
  placeholder: string
  onSubmit: (text: string) => void
  onCancel: () => void
  /** Leaving the field submits what was typed (blank text is discarded by the caller). */
  submitOnBlur?: boolean
  testId?: string
}

/** Enter submits, Shift+Enter is a newline, Escape cancels. */
export function CommentComposer({
  placeholder,
  onSubmit,
  onCancel,
  submitOnBlur,
  testId = "comment-input",
}: CommentComposerProps): React.ReactElement {
  const [text, setText] = useState("")
  return (
    <textarea
      data-testid={testId}
      aria-label={placeholder}
      placeholder={placeholder}
      autoFocus
      rows={2}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => submitOnBlur && onSubmit(text)}
      onKeyDown={(e) => {
        // Keep the editor's own Escape/Delete handling away from the field.
        e.stopPropagation()
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          onSubmit(text)
          setText("")
        } else if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
      className="w-full resize-none rounded border border-panel bg-panel px-2 py-1 text-sm outline-none focus:border-accent"
    />
  )
}

export interface CommentThreadProps {
  t: (key: string) => string
  comment: Comment
  number: number
  /** View mode: the thread can be read but not changed. */
  readOnly: boolean
  onReply: (text: string) => void
  onToggleResolved: () => void
  onDelete: () => void
  onClose: () => void
}

const BTN = "rounded border border-panel px-2 py-0.5 text-xs hover:bg-panel-hover"

export function CommentThread({
  t,
  comment,
  number,
  readOnly,
  onReply,
  onToggleResolved,
  onDelete,
  onClose,
}: CommentThreadProps): React.ReactElement {
  const time = (ms: number): string => new Date(ms).toLocaleString()
  return (
    <div
      data-testid="comment-thread"
      role="dialog"
      aria-label={`${t("comments.pin")} ${number}`}
      className="w-64 rounded-lg border border-panel bg-panel p-2 text-sm shadow-lg"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">
          #{number}
          {comment.resolved ? ` · ${t("comments.resolved")}` : ""}
        </span>
        <button
          type="button"
          data-testid="comment-thread-close"
          aria-label={t("comments.closeThread")}
          onClick={onClose}
          className="rounded px-1 text-xs hover:bg-panel-hover"
        >
          ✕
        </button>
      </div>
      <ul className="mb-2 max-h-60 space-y-1.5 overflow-y-auto">
        {[comment, ...comment.replies].map((m) => (
          <li key={m.id} data-testid="comment-message">
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
            <p className="text-[10px] text-muted">{time(m.createdAt)}</p>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <>
          <CommentComposer
            placeholder={t("comments.replyPlaceholder")}
            onSubmit={(text) => text.trim() && onReply(text)}
            onCancel={onClose}
            testId="comment-reply-input"
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              type="button"
              data-testid="comment-thread-resolve"
              onClick={onToggleResolved}
              className={BTN}
            >
              {comment.resolved ? t("comments.reopen") : t("comments.resolve")}
            </button>
            <button
              type="button"
              data-testid="comment-thread-delete"
              onClick={onDelete}
              className={`${BTN} text-danger`}
            >
              {t("comments.delete")}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
