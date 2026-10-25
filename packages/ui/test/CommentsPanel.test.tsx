import type { Comment } from "@excalidraw-clone/scene"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CommentsPanel } from "../src/CommentsPanel"

const t = (key: string): string => key
const mk = (id: string, text: string, resolved = false): Comment => ({
  id,
  anchor: { kind: "point", x: 0, y: 0 },
  text,
  createdAt: 0,
  resolved,
  replies: [],
})
const comments = [mk("a", "first"), mk("b", "second", true)]

const setup = (readOnly = false) => {
  const props = {
    onSelect: vi.fn(),
    onToggleResolved: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  }
  render(<CommentsPanel t={t} comments={comments} activeId={null} readOnly={readOnly} {...props} />)
  return props
}

describe("CommentsPanel", () => {
  it("lists comments numbered by position and filters open/resolved", async () => {
    setup()
    expect(screen.getByTestId("comments-row-a")).toHaveTextContent("#1first")
    expect(screen.getByTestId("comments-row-b")).toHaveTextContent("#2second")
    await userEvent.click(screen.getByTestId("comments-filter-open"))
    expect(screen.queryByTestId("comments-row-b")).toBeNull()
    expect(screen.getByTestId("comments-row-a")).toBeInTheDocument()
    await userEvent.click(screen.getByTestId("comments-filter-resolved"))
    expect(screen.queryByTestId("comments-row-a")).toBeNull()
    expect(screen.getByTestId("comments-row-b")).toHaveTextContent("comments.reopen")
  })

  it("shows the empty state when there are no comments", () => {
    render(
      <CommentsPanel
        t={t}
        comments={[]}
        activeId={null}
        readOnly={false}
        onSelect={vi.fn()}
        onToggleResolved={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText("comments.empty")).toBeInTheDocument()
  })

  it("selects, resolves, deletes and closes", async () => {
    const p = setup()
    await userEvent.click(screen.getByTestId("comments-row-open-a"))
    expect(p.onSelect).toHaveBeenCalledWith("a")
    await userEvent.click(screen.getByTestId("comments-row-resolve-a"))
    expect(p.onToggleResolved).toHaveBeenCalledWith("a")
    await userEvent.click(screen.getByTestId("comments-row-delete-b"))
    expect(p.onDelete).toHaveBeenCalledWith("b")
    await userEvent.click(screen.getByTestId("comments-panel-close"))
    expect(p.onClose).toHaveBeenCalled()
  })

  it("hides edit actions when read-only", () => {
    setup(true)
    expect(screen.queryByTestId("comments-row-resolve-a")).toBeNull()
    expect(screen.queryByTestId("comments-row-delete-a")).toBeNull()
  })
})
