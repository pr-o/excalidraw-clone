import type { Comment } from "@excalidraw-clone/scene"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CommentComposer, CommentThread } from "../src/CommentThread"

const t = (key: string): string => key
const comment: Comment = {
  id: "a",
  anchor: { kind: "point", x: 0, y: 0 },
  text: "hello",
  createdAt: 0,
  resolved: false,
  replies: [{ id: "r", text: "world", createdAt: 1 }],
}

const setup = (readOnly = false) => {
  const props = {
    onReply: vi.fn(),
    onToggleResolved: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  }
  render(<CommentThread t={t} comment={comment} number={3} readOnly={readOnly} {...props} />)
  return props
}

describe("CommentComposer", () => {
  it("submits on Enter, keeps Shift+Enter as newline, cancels on Escape", async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<CommentComposer placeholder="p" onSubmit={onSubmit} onCancel={onCancel} />)
    const input = screen.getByTestId("comment-input")
    expect(input).toHaveFocus()
    await userEvent.type(input, "a{Shift>}{Enter}{/Shift}b{Enter}")
    expect(onSubmit).toHaveBeenCalledWith("a\nb")
    expect(input).toHaveValue("")
    await userEvent.type(input, "{Escape}")
    expect(onCancel).toHaveBeenCalled()
  })

  it("submits on blur only when asked to", async () => {
    const onSubmit = vi.fn()
    render(<CommentComposer placeholder="p" submitOnBlur onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByTestId("comment-input"), "x")
    await userEvent.click(document.body)
    expect(onSubmit).toHaveBeenCalledWith("x")
  })
})

describe("CommentThread", () => {
  it("shows the comment and its replies", () => {
    setup()
    expect(screen.getAllByTestId("comment-message").map((m) => m.firstChild?.textContent)).toEqual([
      "hello",
      "world",
    ])
    expect(screen.getByRole("dialog")).toHaveAccessibleName("comments.pin 3")
  })

  it("replies, resolves, deletes and closes", async () => {
    const p = setup()
    await userEvent.type(screen.getByTestId("comment-reply-input"), "again{Enter}")
    expect(p.onReply).toHaveBeenCalledWith("again")
    await userEvent.type(screen.getByTestId("comment-reply-input"), "   {Enter}")
    expect(p.onReply).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId("comment-thread-resolve"))
    expect(p.onToggleResolved).toHaveBeenCalled()
    await userEvent.click(screen.getByTestId("comment-thread-delete"))
    expect(p.onDelete).toHaveBeenCalled()
    await userEvent.click(screen.getByTestId("comment-thread-close"))
    expect(p.onClose).toHaveBeenCalled()
  })

  it("is read-only in view mode", () => {
    setup(true)
    expect(screen.queryByTestId("comment-reply-input")).toBeNull()
    expect(screen.queryByTestId("comment-thread-resolve")).toBeNull()
    expect(screen.queryByTestId("comment-thread-delete")).toBeNull()
  })
})
